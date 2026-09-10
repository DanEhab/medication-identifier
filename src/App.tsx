import React, { useState, useCallback, useEffect, useRef } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { ResultScreen } from './components/ResultScreen';
import { ProfessionalScreen } from './components/ProfessionalScreen';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import type { DrugInfo, View, PatientInfo, NotAMedicationResult, PackReading, ReadingStage } from './types';
import { NotAMedicationError } from './types';
import { identifyDrugFromImage, fetchDrugInformation } from './services/geminiService';
import { MyMedicationsScreen } from './components/MyMedicationsScreen';
import { NotFoundScreen } from './components/NotFoundScreen';
import { findSavedMedication, isStale, saveMedication } from './lib/medicationStorage';
import { useLocalization } from './context/LanguageContext';
import { CoachMarks, shouldShowPhase1, shouldShowPhase2, resetPhase1Tutorial, resetPhase2Tutorial } from './components/CoachMarks';
import { IntroSplash } from './components/IntroSplash';
import { CameraHome } from './components/CameraHome';
import { FirstRun, hasAcceptedDisclaimer } from './components/FirstRun';
import { ReadingScreen } from './components/ReadingScreen';
import { ConfirmScreen } from './components/ConfirmScreen';

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
  const lookUp = useCallback(
    async (drugName: string, runId: number) => {
      setReadingStage('matching');
      try {
        setOriginalDrugName(drugName);
        const info = await fetchDrugInformation(drugName, language);
        if (runIdRef.current !== runId) return;
        setDrugInfo(info);
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
          setView('notFound');
        } else {
          setError(err.message || 'An unexpected error occurred.');
          setView('home');
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

  // Re-fetches drug info ONLY when the language actually changes while
  // viewing results or professional screen. Uses a ref to track the previous
  // language and a stale-closure guard to prevent race conditions from rapid toggles.
  const prevLanguageRef = useRef(language);
  useEffect(() => {
    // Skip if language hasn't actually changed (e.g. on initial render or view navigation)
    if (prevLanguageRef.current === language) return;
    prevLanguageRef.current = language;

    if ((view === 'results' || view === 'professional') && originalDrugName) {
      let cancelled = false;
      const refetch = async () => {
        setIsLoading(true);
        try {
          const info = await fetchDrugInformation(originalDrugName, language);
          if (!cancelled) {
            setDrugInfo(info);
          }
        } catch (err: any) {
          if (!cancelled) {
            setError(err.message || 'An unexpected error occurred during re-translation.');
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      };
      refetch();
      return () => { cancelled = true; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const handleBack = () => {
    setView('home');
    setDrugInfo(null);
    setError(null);
    setOriginalDrugName(null);
    setNotFound(null);
  };

  const handleLogoClick = () => {
    handleBack();
  };
  
  const handleReplayTutorial = () => {
    resetPhase1Tutorial();
    resetPhase2Tutorial();
    setShowPhase2(false);
    // The first tour points at home-screen controls, so replaying it from
    // anywhere else has to go there first.
    setView('home');
    setShowPhase1(true);
  };

  const handleShowMyMedications = () => {
    setView('myMedications');
  };

  const handleShowProfessionalView = () => setView('professional');
  const handleBackToPatientView = () => setView('results');

  /** These screens are full-bleed and supply their own bar. */
  const fullBleed: View[] = ['home', 'reading', 'confirm', 'results'];
  const isCameraScreen = fullBleed.includes(view) && !needsDisclaimer;

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
              onPatientInfoChange={handlePatientInfoChange}
            />
          )
        );
      case 'professional':
        // Pass original name to professional view to ensure it fetches data using the non-translated name
        return drugInfo && originalDrugName && <ProfessionalScreen drugName={originalDrugName} onBackToPatientView={handleBackToPatientView} />;
      case 'notFound':
        return notFound && (
          <NotFoundScreen
            result={notFound}
            onSearchAgain={handleBack}
            onScan={handleBack}
          />
        );
      case 'myMedications':
        return <MyMedicationsScreen onBack={handleBack} onSelectMed={handleSelectMed}/>;
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
      case 'search':
        return <HomeScreen onIdentify={handleIdentify} error={error} />;
      case 'home':
      default:
        return (
          <CameraHome
            onIdentify={handleIdentify}
            onTypeInstead={() => setView('search')}
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
      {!showIntro && needsDisclaimer && <FirstRun onAccept={() => setNeedsDisclaimer(false)} />}
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
          className={`min-h-screen flex flex-col ${isCameraScreen ? 'bg-paper' : 'bg-gray-50 dark:bg-[#0D0D0D]'} transition-colors duration-300 ${language === 'ar' ? 'font-arabic' : 'font-sans'}`}>
      {/*
        The camera screen carries its own bar and runs edge to edge, so the
        app chrome and the padded container would only crop the viewfinder.
        Every other screen keeps them.
      */}
      {needsDisclaimer ? null : isCameraScreen ? (
        renderContent()
      ) : (
        <>
          <Header onHomeClick={handleLogoClick} onShowMyMedications={handleShowMyMedications} onReplayTutorial={handleReplayTutorial} />
          <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
            {renderContent()}
          </main>
          <Footer />
        </>
      )}

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