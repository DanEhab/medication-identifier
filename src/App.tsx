import React, { useState, useCallback, useEffect, useRef } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ProfessionalScreen } from './components/ProfessionalScreen';
import { Spinner } from './components/Spinner';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import type { DrugInfo, View, PatientInfo, NotAMedicationResult } from './types';
import { NotAMedicationError } from './types';
import { identifyDrugFromImage, fetchDrugInformation } from './services/geminiService';
import { MyMedicationsScreen } from './components/MyMedicationsScreen';
import { NotFoundScreen } from './components/NotFoundScreen';
import { findSavedMedication, isStale, saveMedication } from './lib/medicationStorage';
import { useLocalization } from './context/LanguageContext';
import { CoachMarks, shouldShowPhase1, shouldShowPhase2, resetPhase1Tutorial, resetPhase2Tutorial } from './components/CoachMarks';
import { Capacitor } from '@capacitor/core';

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
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const { language, t } = useLocalization();
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const handleIdentify = useCallback(async (image: File | null, drugName: string) => {
    setIsLoading(true);
    setError(null);
    setDrugInfo(null);
    setNotFound(null);

    try {
      let identifiedName = drugName;
      if (image) {
        const reader = new FileReader();
        reader.readAsDataURL(image);
        await new Promise<void>((resolve, reject) => {
            reader.onload = async () => {
                try {
                    const base64Image = (reader.result as string).split(',')[1];
                    identifiedName = await identifyDrugFromImage(base64Image, image.type);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = error => reject(error);
        });
      }

      if (!identifiedName) {
        throw new Error('Could not identify the drug. Please try again with a clearer image or by typing the name.');
      }
      
      setOriginalDrugName(identifiedName);
      const info = await fetchDrugInformation(identifiedName, language);
      setDrugInfo(info);
      setView('results');
    } catch (err: any) {
      // Not every failure is an error. "That isn't a medication" deserves a
      // proper explanation, not a red banner on the home screen.
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
  }, [language]);

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
    setShowPhase1(true);
  };

  const handleShowMyMedications = () => {
    setView('myMedications');
  };

  const handleShowProfessionalView = () => setView('professional');
  const handleBackToPatientView = () => setView('results');

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full pt-20">
          <Spinner />
          <p className="text-brand-dark mt-4 text-lg">{t('analyzingMedication')}</p>
        </div>
      );
    }

    switch (view) {
      case 'results':
        return drugInfo && <ResultsScreen drugInfo={drugInfo} patientInfo={patientInfo} originalDrugName={originalDrugName || drugInfo.drugName} onBack={handleBack} onShowProfessionalView={handleShowProfessionalView} onPatientInfoChange={handlePatientInfoChange} />;
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
      case 'home':
      default:
        return <HomeScreen onIdentify={handleIdentify} error={error} />;
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

  const handleVideoEnd = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      setShowIntro(false);
    }, 500);
  };

  return (
    <>
      {showIntro && (
        <div
          className={`fixed inset-0 z-[9999] overflow-hidden bg-white transition-opacity duration-500 ${
            isFadingOut ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {/*
            The clip is portrait (428x944). object-cover used to crop it badly on
            tablets and in landscape, so it now uses object-contain and the space
            around it is filled with a blurred copy of the same frame. The clip
            starts white and ends teal, so a fixed backdrop colour would clash
            partway through; mirroring the video keeps it matched throughout.
          */}
          <video
            src="/intro.mp4"
            autoPlay
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
          />
          <video
            ref={videoRef}
            src="/intro.mp4"
            autoPlay
            muted={!Capacitor.isNativePlatform()}
            playsInline
            preload="auto"
            poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            onEnded={handleVideoEnd}
            className="relative h-full w-full object-contain"
            style={{ transform: 'translateZ(0)' }}
          />
        </div>
      )}
      {!showIntro && (
        <div className={`min-h-screen flex flex-col bg-gray-50 dark:bg-[#0D0D0D] transition-colors duration-300 ${language === 'ar' ? 'font-arabic' : 'font-sans'}`}>
      <Header onHomeClick={handleLogoClick} onShowMyMedications={handleShowMyMedications} onReplayTutorial={handleReplayTutorial} />
      <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
        {renderContent()}
      </main>
      <Footer />

      {/* ── Onboarding Coach Marks ── */}
      {showPhase1 && view === 'home' && !isLoading && (
        <CoachMarks
          phase={1}
          onPhaseComplete={() => setShowPhase1(false)}
        />
      )}
      {showPhase2 && view === 'results' && !isLoading && (
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