import React, { useState, useRef } from 'react';
import { CameraIcon, MagnifyingGlassIcon, UserIcon, DocumentArrowUpIcon } from './Icons';
import type { PatientInfo } from '../types';
import { useLocalization } from '../context/LanguageContext';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

interface HomeScreenProps {
  onIdentify: (image: File | null, drugName: string) => void;
  error: string | null;
  patientInfo: PatientInfo;
  onPatientInfoChange: (newInfo: Partial<PatientInfo>) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onIdentify, error, patientInfo, onPatientInfoChange }) => {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [drugName, setDrugName] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [validationError, setValidationError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLocalization();

  // Network status monitoring
  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
      setDrugName(''); // Clear text input when image is selected
      setValidationError('');
    }
  };
  
  const validateInputs = (): boolean => {
    // Validate age
    if (patientInfo.age) {
      const age = parseInt(patientInfo.age);
      if (isNaN(age) || age < 0 || age > 150) {
        setValidationError(t('invalidAge'));
        return false;
      }
    }
    
    // Validate name length
    if (patientInfo.name && patientInfo.name.length > 100) {
      setValidationError(t('nameTooLong'));
      return false;
    }
    
    // Validate drug name
    if (drugName && drugName.trim().length < 2) {
      setValidationError(t('drugNameTooShort'));
      return false;
    }
    
    setValidationError('');
    return true;
  };

  const handleIdentifyClick = () => {
    // Check network connection
    if (!isOnline) {
      setValidationError(t('noInternetConnection'));
      return;
    }
    
    // Validate inputs
    if (!validateInputs()) {
      return;
    }
    
    if (image || drugName) {
      onIdentify(image, drugName);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  }
  
  const triggerCamera = async () => {
    // Use native camera on mobile, fallback to file input on web
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
          quality: 90,
          allowEditing: false,
          saveToGallery: false
        });
        
        if (photo.dataUrl) {
          // Convert data URL to file
          const response = await fetch(photo.dataUrl);
          const blob = await response.blob();
          const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
          setImage(file);
          setImagePreview(photo.dataUrl);
          setDrugName(''); // Clear text input when image is selected
        }
      } catch (error) {
        console.error('Camera error:', error);
        // Error handling - user cancelled or camera unavailable
      }
    } else {
      // Fallback to file input on web
      cameraInputRef.current?.click();
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-brand-dark mb-2">{t('homeTitle')}</h1>
        <p className="text-lg text-gray-600">
          {t('homeSubtitle')}
        </p>
      </div>

      {/* Patient Info Card */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg w-full">
        <div className="flex items-center mb-4">
          <UserIcon className="w-8 h-8 text-brand-primary me-3" />
          <h2 className="text-2xl font-bold text-brand-dark">{t('patientDetails')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="patient-name" className="block text-sm font-medium text-gray-700 mb-1">{t('name')}</label>
            <input 
              type="text" 
              id="patient-name"
              value={patientInfo.name}
              onChange={(e) => {
                // Sanitize input - remove special characters and limit length
                const sanitized = e.target.value.slice(0, 100);
                onPatientInfoChange({ name: sanitized });
              }}
              placeholder={t('namePlaceholder')}
              maxLength={100}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-accent focus:border-brand-primary transition" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="patient-age" className="block text-sm font-medium text-gray-700 mb-1">{t('age')}</label>
              <input 
                type="number" 
                id="patient-age"
                min="0"
                max="150"
                value={patientInfo.age}
                onChange={(e) => onPatientInfoChange({ age: e.target.value })}
                placeholder={t('agePlaceholder')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-accent focus:border-brand-primary transition" />
            </div>
            <div>
              <label htmlFor="patient-sex" className="block text-sm font-medium text-gray-700 mb-1">{t('sex')}</label>
              <select 
                id="patient-sex"
                value={patientInfo.sex}
                onChange={(e) => onPatientInfoChange({ sex: e.target.value as PatientInfo['sex'] })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-accent focus:border-brand-primary transition bg-white"
              >
                <option value="">{t('select')}</option>
                <option value="Male">{t('male')}</option>
                <option value="Female">{t('female')}</option>
                <option value="Other">{t('other')}</option>
                <option value="Prefer not to say">{t('preferNotToSay')}</option>
              </select>
            </div>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="patient-diagnosis" className="block text-sm font-medium text-gray-700 mb-1">{t('diagnosis')}</label>
            <input 
              type="text" 
              id="patient-diagnosis"
              value={patientInfo.diagnosis}
              onChange={(e) => onPatientInfoChange({ diagnosis: e.target.value })}
              placeholder={t('diagnosisPlaceholder')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-accent focus:border-brand-primary transition" />
          </div>
        </div>
      </div>

      {/* Identification Card */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg w-full">
        <h2 className="text-2xl font-bold text-brand-dark mb-6 text-center">{t('identifyYourMedication')}</h2>
        
        {!isOnline && (
            <div className="bg-yellow-100 border-s-4 border-yellow-500 text-yellow-700 p-4 mb-6 rounded-md" role="alert">
                <p className="font-bold">⚠️ {t('offline')}</p>
                <p>{t('noInternetConnection')}</p>
            </div>
        )}
        
        {validationError && (
            <div className="bg-orange-100 border-s-4 border-orange-500 text-orange-700 p-4 mb-6 rounded-md" role="alert">
                <p className="font-bold">{t('validationError')}</p>
                <p>{validationError}</p>
            </div>
        )}
        
        {error && (
            <div className="bg-red-100 border-s-4 border-red-500 text-red-700 p-4 mb-6 rounded-md" role="alert">
                <p className="font-bold">{t('error')}</p>
                <p>{error}</p>
            </div>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <button onClick={triggerCamera} className="w-full group flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-brand-primary hover:bg-brand-accent transition-all duration-300">
               <CameraIcon className="w-12 h-12 text-gray-400 group-hover:text-brand-primary mb-2 transition-colors"/>
               <span className="font-semibold text-brand-dark">{t('takeAPhoto')}</span>
               <span className="text-sm text-gray-500">{t('useYourCamera')}</span>
            </button>
            <button onClick={triggerFileSelect} className="w-full group flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-brand-primary hover:bg-brand-accent transition-all duration-300">
               <DocumentArrowUpIcon className="w-12 h-12 text-gray-400 group-hover:text-brand-primary mb-2 transition-colors"/>
               <span className="font-semibold text-brand-dark">{t('uploadAnImage')}</span>
               <span className="text-sm text-gray-500">{t('selectFromLibrary')}</span>
            </button>
        </div>

        <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraInputRef}
            onChange={handleImageChange}
            className="hidden"
        />
        <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageChange}
            className="hidden"
        />

        {imagePreview && (
          <div className="mt-6 text-center">
            <h3 className="font-semibold text-gray-700">{t('imagePreview')}</h3>
            <img src={imagePreview} alt="Medication preview" className="mt-2 rounded-lg max-h-48 mx-auto shadow-md" />
          </div>
        )}

        <div className="relative my-6 flex items-center">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink mx-4 text-gray-500 font-semibold">{t('or')}</span>
            <div className="flex-grow border-t border-gray-300"></div>
        </div>

        <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute start-4 top-1/2 -translate-y-1/2"/>
            <input
                type="text"
                value={drugName}
                onChange={(e) => {
                  setDrugName(e.target.value);
                  setImage(null);
                  setImagePreview(null);
                }}
                placeholder={t('typeDrugNamePlaceholder')}
                className="w-full ps-12 pe-4 py-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-brand-accent focus:border-brand-primary transition"
            />
        </div>
        
        <button 
            onClick={handleIdentifyClick}
            disabled={!image && !drugName}
            className="w-full mt-6 bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-bold py-3 px-4 rounded-full hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
        >
            {t('findMyMedication')}
        </button>
      </div>
    </div>
  );
};