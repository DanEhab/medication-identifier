import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { SearchScreen } from './components/SearchScreen';
import { ResultScreen } from './components/ResultScreen';
import { SideEffectsScreen } from './components/SideEffectsScreen';
import { recordRecentSearch } from './lib/recentSearches';
import { ProfessionalScreen } from './components/ProfessionalScreen';
import type { DrugInfo, View, PatientInfo, NotAMedicationResult, PackReading, ReadingStage, DetailSection } from './types';
import { NotAMedicationError } from './types';
import { identifyDrugFromImage, fetchDrugInformation } from './services/geminiService';
import { MyMedicinesScreen } from './components/MyMedicinesScreen';
import type { Tab } from './components/TabBar';
import { NotFoundScreen } from './components/NotFoundScreen';
import { findSavedMedication, isStale, saveMedication } from './lib/medicationStorage';
import { useLocalization } from './context/LanguageContext';
import { CoachMarks, resetTour, shouldShowPhase1, shouldShowPhase2 } from './components/CoachMarks';
import { IntroSplash } from './components/IntroSplash';
import { CameraHome } from './components/CameraHome';
import { FirstRun, hasAcceptedDisclaimer } from './components/FirstRun';
import { ReadingScreen } from './components/ReadingScreen';
import { ConfirmScreen } from './components/ConfirmScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { useHardwareBack } from './hooks/useHardwareBack';
import { useReminders } from './hooks/useReminders';

const App: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [drugInfo, setDrugInfo] = useState<DrugInfo | null>(null);
  const [originalDrugName, setOriginalDrugName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<NotAMedicationResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    name: '',
    age: '',
    sex: '',
    diagnosis: '',
  });
  const [showIntro, setShowIntro] = useState<boolean>(true);
  // The disclaimer gates the app on first launch. Existing installs have no
  // flag yet, so they see it once too — nobody loses the notice.
  const [needsDisclaimer, setNeedsDisclaimer] = useState<boolean>(() => !hasAcceptedDisclaimer());
  /** True when it was opened from settings rather than shown on first launch. */
  const [disclaimerIsReview, setDisclaimerIsReview] = useState(false);

  // ── Reading a pack ────────────────────────────────────────
  const [reading, setReading] = useState<PackReading | null>(null);
  const [readingStage, setReadingStage] = useState<ReadingStage>('reading');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  /**
   * Bumped whenever the user cancels or starts again. Every async step checks
   * it before touching state, so an abandoned lookup can never arrive late and
   * push the user into a screen they walked away from.
   */
  const runIdRef = useRef(0);

  const releasePhoto = useCallback(() => {
    setPhotoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);
  const { language } = useLocalization();

  /*
    The reminders are rebuilt here, at the root, and nowhere else.

    An alarm does not survive the phone being switched off, and the saved list
    is the only record of what was meant to be scheduled. Doing it on the
    screen that shows the times would mean reminders coming back the next time
    somebody happened to open that list — which is exactly when they do not
    need reminding.
  */
  useReminders({ syncOnMount: true });

  // ── Tutorial state ────────────────────────────────────────
  // Phase 1: triggered on absolute first launch (home screen tour)
  const [showPhase1, setShowPhase1] = useState<boolean>(() => shouldShowPhase1());
  // Phase 2: triggered on first successful scan/search result
  const [showPhase2, setShowPhase2] = useState<boolean>(false);

  // Fire phase 2 the first time the results screen appears
  useEffect(() => {
    if (view === 'results' && shouldShowPhase2()) {
      // Small delay so the results screen has rendered its target elements
      const tid = setTimeout(() => setShowPhase2(true), 600);
      return () => clearTimeout(tid);
    }
  }, [view]);

  // A tour that has already been shown is finished with, even if the user
  // navigated away half-way through it. These flags used to stay set, so the
  // component remounted — and the tour replayed — every time its screen came
  // back. That is what made the results tour appear after every search.
  useEffect(() => {
    if (view !== 'home') setShowPhase1(false);
    if (view !== 'results') setShowPhase2(false);
  }, [view]);
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const savedPatientInfo = localStorage.getItem('patientInfo');
      if (savedPatientInfo) {
        setPatientInfo(JSON.parse(savedPatientInfo));
      }
    } catch (e) {
      console.error("Failed to load patient info from localStorage", e);
    }
  }, []);

  const handlePatientInfoChange = (newInfo: Partial<PatientInfo>) => {
    setPatientInfo(prevInfo => {
        const updatedInfo = { ...prevInfo, ...newInfo };
        localStorage.setItem('patientInfo', JSON.stringify(updatedInfo));
        return updatedInfo;
    });
  };

  /**
   * Looks a medicine up by name and shows the result. Used by the confirm
   * step, by typed search, and by the saved list.
   */
  /**
   * Where the lookup was started from, so a failure goes back there. A typed
   * search that failed used to land on the camera with the typed name gone.
   */
  const lookupOrigin = useRef<View>('home');

  /** True once "we got it wrong" has been used and still found nothing. */
  const [insistedAlready, setInsistedAlready] = useState(false);

  const lookUp = useCallback(
    async (drugName: string, runId: number, insist = false) => {
      setReadingStage('matching');
      try {
        setOriginalDrugName(drugName);
        const info = await fetchDrugInformation(drugName, language, { insist });
        if (runIdRef.current !== runId) return;
        setDrugInfo(info);
        // Only a lookup that actually found something is worth offering back
        // as a suggestion; a misspelling that went nowhere is not.
        recordRecentSearch(drugName);
        setView('results');
        releasePhoto();
      } catch (err: any) {
        if (runIdRef.current !== runId) return;
        if (err instanceof NotAMedicationError) {
          setNotFound({
            recognition: err.recognition,
            query: err.query,
            identifiedAs: err.identifiedAs,
            safetyNote: err.safetyNote,
          });
          // Asking again and getting the same answer is worth saying out loud,
          // rather than letting somebody tap the same link forever.
          setInsistedAlready(insist);
          setView('notFound');
        } else {
          setError(err.message || 'An unexpected error occurred.');
          setView(lookupOrigin.current);
        }
        releasePhoto();
      }
    },
    [language, releasePhoto],
  );

  /**
   * A photo is read first and confirmed second. Going straight to a drug page
   * turned a misread label into a confident page about the wrong medicine.
   */
  const handleScan = useCallback(
    async (image: File) => {
      const runId = ++runIdRef.current;
      setError(null);
      setDrugInfo(null);
      setNotFound(null);
      setReading(null);
      setReadingStage('reading');

      releasePhoto();
      setPhotoUrl(URL.createObjectURL(image));
      lookupOrigin.current = 'home';
      setView('reading');

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not read that photo.'));
          reader.readAsDataURL(image);
        });

        const result = await identifyDrugFromImage(base64, image.type);
        if (runIdRef.current !== runId) return;
        setReading(result);
        setView('confirm');
      } catch (err: any) {
        if (runIdRef.current !== runId) return;
        setError(err.message || 'An unexpected error occurred.');
        setView('home');
        releasePhoto();
      }
    },
    [releasePhoto],
  );

  /** The typed path needs no confirmation: the user supplied the name. */
  const handleIdentify = useCallback(
    (image: File | null, drugName: string) => {
      if (image) {
        void handleScan(image);
        return;
      }
      const runId = ++runIdRef.current;
      setError(null);
      setDrugInfo(null);
      setNotFound(null);
      setReading(null);
      releasePhoto();
      setReadingStage('matching');
      lookupOrigin.current = 'search';
      setView('reading');
      void lookUp(drugName, runId);
    },
    [handleScan, lookUp, releasePhoto],
  );

  const handleConfirmReading = useCallback(
    (drugName: string) => {
      const runId = ++runIdRef.current;
      setView('reading');
      void lookUp(drugName, runId);
    },
    [lookUp],
  );

  /** Cancelling abandons the run: a late result can no longer land. */
  const handleCancelReading = useCallback(() => {
    runIdRef.current += 1;
    releasePhoto();
    setReading(null);
    setError(null);
    setView('home');
  }, [releasePhoto]);

  /*
    A medicine is fetched again when the language changes.

    The answer itself is generated in English and translated on the way to the
    screen, so the words on a medicine page are not reactive the way the app's
    own labels are: nothing about switching language rewrites what is already
    in state. This effect is what does it.

    It used to run only while the medicine was the screen being looked at —
    which was true of every way of changing the language, until the settings
    gear arrived on the medicine page itself. From there the language changes
    while `view` is 'settings', so the guard was false, the refetch was
    skipped, and the remembered language was updated anyway. Coming back to the
    medicine there was nothing left to notice: the page was right to left with
    Arabic headings around an answer still in English.

    So the condition is now the one that was always meant: a medicine is
    loaded. Which screen happens to be on top decides only whether to show the
    spinner, because a spinner over the camera would be answering a question
    nobody asked.
  */
  const prevLanguageRef = useRef(language);
  useEffect(() => {
    if (prevLanguageRef.current === language) return;
    prevLanguageRef.current = language;
    if (!originalDrugName || !drugInfo) return;

    const showsTheMedicine = view === 'results' || view === 'professional' || view === 'sideEffects'
      || (view === 'settings' && (settingsFrom === 'results' || settingsFrom === 'professional'));

    let cancelled = false;
    const refetch = async () => {
      if (showsTheMedicine) setIsLoading(true);
      try {
        const info = await fetchDrugInformation(originalDrugName, language);
        if (!cancelled) setDrugInfo(info);
      } catch (err: any) {
        if (!cancelled && showsTheMedicine) {
          setError(err.message || 'An unexpected error occurred during re-translation.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    refetch();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const handleBack = () => {
    setView('home');
    setDrugInfo(null);
    setError(null);
    setOriginalDrugName(null);
    setNotFound(null);
    setInsistedAlready(false);
  };

  /**
   * "We got it wrong — it is a medicine". Asks again, saying so. Nothing is
   * forced: something genuinely not a medicine is refused a second time, and
   * the screen then says the second attempt found nothing either.
   */
  const handleInsist = () => {
    if (!notFound) return;
    const runId = ++runIdRef.current;
    setNotFound(null);
    setReadingStage('matching');
    setView('reading');
    void lookUp(notFound.query, runId, true);
  };


  const handleShowMyMedications = () => {
    setView('myMedications');
  };

  /** The three places the tab bar names. */
  const handleSelectTab = (tab: Tab) => {
    setError(null);
    setView(tab === 'scan' ? 'home' : tab === 'search' ? 'search' : 'myMedications');
  };

  /**
   * Which tab was on screen when settings was opened, so its back control
   * returns there rather than always to the camera.
   */
  const [settingsFrom, setSettingsFrom] = useState<View>('home');

  const openSettings = () => {
    rememberWhereWeWere();
    setSettingsFrom(view);
    setView('settings');
  };

  /*
    A new screen starts at its top.

    Every screen is rendered into the same scrolling document, so moving
    between them left the scroll position exactly where it was. The chips are
    near the foot of a medicine page, which means you had scrolled to reach
    them — and the side effects then opened part of the way down, with its own
    heading above the fold. It looked like the page had opened at the bottom,
    because it had.

    Coming back to a medicine is the exception. That is a return, not an
    arrival: the position is the one you left, and dropping somebody at the top
    of a page they were halfway down — to make them scroll back to the chips
    they were using — is its own small rudeness.
  */
  const resultScroll = useRef(0);
  const previousView = useRef<View>(view);

  /*
    Noted as the tap happens, not as the next screen arrives.

    Reading window.scrollY from the effect that runs after the new view is
    committed gives the wrong number: the document has already become a
    different length, so the browser has clamped the position to fit it. A
    medicine read six hundred pixels down came back as a hundred and seventy.
  */
  const rememberWhereWeWere = () => {
    if (view === 'results') resultScroll.current = window.scrollY;
  };

  useLayoutEffect(() => {
    const from = previousView.current;
    if (from === view) return;
    previousView.current = view;

    const returningToMedicine = view === 'results'
      && (from === 'sideEffects' || from === 'professional' || from === 'settings');

    window.scrollTo(0, returningToMedicine ? resultScroll.current : 0);
  }, [view]);

  // A different medicine is a fresh page, so the remembered position goes with
  // the old one rather than being applied to something it was never measured on.
  useEffect(() => { resultScroll.current = 0; }, [drugInfo]);

  /*
    Runs the tour again from the beginning.

    Both phases are cleared, not just the camera one: somebody asking to be
    shown around again means the whole app, and the result screen's four steps
    are the half that explains the answer they came for.

    Except when settings was opened from a medicine. Asking to be shown around
    from there means this page — the four steps that explain the answer on
    screen — and sending somebody back to the camera to find their medicine
    again is answering a different question. So that case replays the medicine
    page's half in place, and leaves the camera's half alone.
  */
  const replayTutorial = () => {
    resetTour();
    if (settingsFrom === 'results') {
      setShowPhase1(false);
      setShowPhase2(true);
      setView('results');
      return;
    }
    setShowPhase1(true);
    setShowPhase2(false);
    setError(null);
    setView('home');
  };

  /*
    What the Android back button means on each screen.

    Returning false is the only thing that closes the app, and only the camera
    does that — everywhere else back undoes the last step, which is what the
    rest of Android does and what this app did not do at all until now.

    Overlays come first because they are on top of whatever is underneath:
    pressing back with the tour open should close the tour, not the screen the
    tour is standing on.
  */
  const handleHardwareBack = useCallback((): boolean => {
    if (needsDisclaimer) {
      // A gate on first launch: accept it or leave. Re-opened from settings it
      // is just a document, and back puts it away.
      if (!disclaimerIsReview) return false;
      setNeedsDisclaimer(false);
      setDisclaimerIsReview(false);
      return true;
    }
    if (showPhase1 || showPhase2) {
      setShowPhase1(false);
      setShowPhase2(false);
      return true;
    }

    switch (view) {
      case 'settings':
        setView(settingsFrom);
        return true;
      case 'sideEffects':
      case 'professional':
        setView('results');
        return true;
      case 'reading':
      case 'confirm':
        handleCancelReading();
        return true;
      case 'results':
      case 'notFound':
        handleBack();
        return true;
      case 'search':
      case 'myMedications':
        setError(null);
        setView('home');
        return true;
      case 'home':
      default:
        return false;
    }
  }, [view, settingsFrom, needsDisclaimer, disclaimerIsReview, showPhase1, showPhase2, handleCancelReading]);

  useHardwareBack(handleHardwareBack);

  /** Which section the side effects screen should open at. */
  const [detailSection, setDetailSection] = useState<DetailSection>('sideEffects');

  const handleShowDetails = (section: DetailSection) => {
    rememberWhereWeWere();
    setDetailSection(section);
    setView('sideEffects');
  };

  const handleShowProfessionalView = () => {
    rememberWhereWeWere();
    setView('professional');
  };
  const handleBackToPatientView = () => setView('results');

  const renderContent = () => {
    switch (view) {
      case 'results':
        return (
          drugInfo && (
            <ResultScreen
              drugInfo={drugInfo}
              patientInfo={patientInfo}
              originalDrugName={originalDrugName || drugInfo.drugName}
              onBack={handleBack}
              onShowProfessionalView={handleShowProfessionalView}
              onShowMyMedications={handleShowMyMedications}
              onShowDetails={handleShowDetails}
              onPatientInfoChange={handlePatientInfoChange}
              onOpenSettings={openSettings}
            />
          )
        );
      case 'sideEffects':
        return (
          drugInfo && (
            <SideEffectsScreen
              drugInfo={drugInfo}
              patientInfo={patientInfo}
              originalDrugName={originalDrugName || drugInfo.drugName}
              anchor={detailSection}
              onBack={() => setView('results')}
              onPatientInfoChange={handlePatientInfoChange}
            />
          )
        );
      case 'professional':
        // Pass original name to professional view to ensure it fetches data using the non-translated name
        return drugInfo && originalDrugName && (
          <ProfessionalScreen
            drugName={originalDrugName}
            drugInfo={drugInfo}
            patientInfo={patientInfo}
            onBackToPatientView={handleBackToPatientView}
            onPatientInfoChange={handlePatientInfoChange}
          />
        );
      case 'notFound':
        return notFound && (
          <NotFoundScreen
            result={notFound}
            onScan={handleBack}
            onSearchAgain={() => { setNotFound(null); setInsistedAlready(false); setView('search'); }}
            onInsist={handleInsist}
            insistedAlready={insistedAlready}
          />
        );
      case 'myMedications':
        return (
          <MyMedicinesScreen
            onSelectMed={handleSelectMed}
            onSelectTab={handleSelectTab}
            onOpenSettings={openSettings}
          />
        );
      case 'reading':
        return (
          <ReadingScreen photoUrl={photoUrl} stage={readingStage} onCancel={handleCancelReading} />
        );
      case 'confirm':
        return (
          reading && (
            <ConfirmScreen
              reading={reading}
              photoUrl={photoUrl}
              onConfirm={handleConfirmReading}
              onReject={handleCancelReading}
            />
          )
        );
      case 'settings':
        return (
          <SettingsScreen
            onBack={() => setView(settingsFrom)}
            onReplayTutorial={replayTutorial}
            onShowDisclaimer={() => {
              setDisclaimerIsReview(true);
              setNeedsDisclaimer(true);
              setView(settingsFrom);
            }}
          />
        );
      case 'search':
        return (
          <SearchScreen
            onIdentify={handleIdentify}
            onBack={() => { setError(null); setView('home'); }}
            onSelectTab={handleSelectTab}
            onOpenSettings={openSettings}
            error={error}
          />
        );
      case 'home':
      default:
        return (
          <CameraHome
            onIdentify={handleIdentify}
            onTypeInstead={() => setView('search')}
            onSelectTab={handleSelectTab}
            onOpenSettings={openSettings}
            error={error}
          />
        );
    }
  };

  const handleSelectMed = async (name: string) => {
    setError(null);
    setNotFound(null);

    // A saved medicine is already on the device in full. Show it immediately —
    // no spinner, no network, no tokens — which is what makes the list usable
    // with no signal at all.
    const saved = findSavedMedication(name, language);
    if (saved) {
      setOriginalDrugName(saved.originalName || name);
      setDrugInfo(saved.drugInfo);
      setView('results');
      setIsLoading(false);

      // Past the refresh window, quietly bring it up to date in the background.
      // The user keeps reading the stored copy either way.
      if (isStale(saved)) {
        fetchDrugInformation(saved.originalName || name, language)
          .then((fresh) => {
            saveMedication(fresh, language, saved.originalName || name);
            setDrugInfo((current) => (current === saved.drugInfo ? fresh : current));
          })
          .catch(() => {
            /* Offline or unreachable — the stored copy stays on screen. */
          });
      }
      return;
    }

    setIsLoading(true);
    setDrugInfo(null);
    try {
        setOriginalDrugName(name);
        const info = await fetchDrugInformation(name, language);
        setDrugInfo(info);
        setView('results');
    } catch (err: any) {
        if (err instanceof NotAMedicationError) {
          setNotFound({
            recognition: err.recognition,
            query: err.query,
            identifiedAs: err.identifiedAs,
            safetyNote: err.safetyNote,
          });
          setView('notFound');
        } else {
          setError(err.message || 'An unexpected error occurred.');
          setView('home');
        }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <>
      {showIntro && <IntroSplash onDone={() => setShowIntro(false)} />}
      {!showIntro && needsDisclaimer && (
        <FirstRun onAccept={() => { setNeedsDisclaimer(false); setDisclaimerIsReview(false); }} />
      )}
      {/*
        The app is built underneath the splash rather than after it. It used to
        wait for the clip to finish before mounting at all, so the first render
        — fonts, layout, saved medicines — happened at the moment the splash
        cleared and the user watched it assemble. The splash covers it while it
        gets ready, so it is already there when the clip ends.
      */}
      {(
        <div
          aria-hidden={showIntro}
          className={`min-h-screen flex flex-col bg-paper transition-colors duration-300 ${language === 'ar' ? 'font-arabic' : 'font-sans'}`}>
      {/*
        Every screen in the redesign carries its own bar and runs edge to edge,
        so there is no shared chrome left to draw around them.
      */}
      {needsDisclaimer ? null : renderContent()}

      {/* ── Onboarding Coach Marks ── */}
      {showPhase1 && !showIntro && !needsDisclaimer && view === 'home' && !isLoading && (
        <CoachMarks
          phase={1}
          onPhaseComplete={() => setShowPhase1(false)}
        />
      )}
      {showPhase2 && !showIntro && !needsDisclaimer && view === 'results' && !isLoading && (
        <CoachMarks
          phase={2}
          onPhaseComplete={() => setShowPhase2(false)}
        />
      )}
    </div>
      )}
    </>
  );
};

export default App;