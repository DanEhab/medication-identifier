import React, { useState, useCallback, useEffect } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ProfessionalScreen } from './components/ProfessionalScreen';
import { Spinner } from './components/Spinner';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import type { DrugInfo, View, PatientInfo } from './types';
import { identifyDrugFromImage, fetchDrugInformation } from './services/geminiService';
import { MyMedicationsScreen } from './components/MyMedicationsScreen';
import { useLocalization } from './context/LanguageContext';

const App: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [drugInfo, setDrugInfo] = useState<DrugInfo | null>(null);
  const [originalDrugName, setOriginalDrugName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    name: '',
    age: '',
    sex: '',
    diagnosis: '',
  });
  const { language, t } = useLocalization();

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
      setError(err.message || 'An unexpected error occurred.');
      setView('home');
    } finally {
      setIsLoading(false);
    }
  }, [language]);

  // Re-fetches drug info if user changes language on results/professional screen
  useEffect(() => {
    if ((view === 'results' || view === 'professional') && originalDrugName) {
      const refetch = async () => {
        setIsLoading(true);
        try {
          const info = await fetchDrugInformation(originalDrugName, language);
          setDrugInfo(info);
        } catch (err: any) {
          setError(err.message || 'An unexpected error occurred during re-translation.');
        } finally {
          setIsLoading(false);
        }
      };
      refetch();
    }
  }, [language, originalDrugName, view]);

  const handleBack = () => {
    setView('home');
    setDrugInfo(null);
    setError(null);
    setOriginalDrugName(null);
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
        return drugInfo && <ResultsScreen drugInfo={drugInfo} patientInfo={patientInfo} onBack={handleBack} onShowProfessionalView={handleShowProfessionalView} />;
      case 'professional':
        // Pass original name to professional view to ensure it fetches data using the non-translated name
        return drugInfo && originalDrugName && <ProfessionalScreen drugName={originalDrugName} onBackToPatientView={handleBackToPatientView} />;
      case 'myMedications':
        return <MyMedicationsScreen onBack={handleBack} onSelectMed={handleSelectMed}/>;
      case 'home':
      default:
        return <HomeScreen 
            onIdentify={handleIdentify} 
            error={error}
            patientInfo={patientInfo}
            onPatientInfoChange={handlePatientInfoChange}
        />;
    }
  };

  const handleSelectMed = async (name: string) => {
    setIsLoading(true);
    setError(null);
    setDrugInfo(null);
    try {
        setOriginalDrugName(name);
        const info = await fetchDrugInformation(name, language);
        setDrugInfo(info);
        setView('results');
    } catch (err: any) {
        setError(err.message || 'An unexpected error occurred.');
        setView('home');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col bg-gray-50 ${language === 'ar' ? 'font-arabic' : 'font-sans'}`}>
      <Header onHomeClick={handleBack} onShowMyMedications={handleShowMyMedications} />
      <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
        {renderContent()}
      </main>
      <Footer />
    </div>
  );
};

export default App;