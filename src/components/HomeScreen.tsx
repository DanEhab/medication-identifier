import React, { useState, useRef } from 'react';
import { CameraIcon, MagnifyingGlassIcon, DocumentArrowUpIcon, XMarkIcon } from './Icons';
import { useLocalization } from '../context/LanguageContext';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

interface HomeScreenProps {
  onIdentify: (image: File | null, drugName: string) => void;
  error: string | null;
}

/**
 * The first thing a new user sees, and now the only thing: identify a
 * medication. The patient details form used to sit above this card, so the app
 * asked for a name and a diagnosis before it had done anything useful. Those
 * fields now live behind an optional step on the results screen, where they are
 * actually needed — see PatientDetailsDialog.
 */
export const HomeScreen: React.FC<HomeScreenProps> = ({ onIdentify, error }) => {
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

  // Clean up Object URL on unmount to prevent memory leaks
  React.useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const releasePreview = () => {
    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      // Revoke the old Object URL before creating a new one
      releasePreview();
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
      setDrugName(''); // Clear text input when image is selected
      setValidationError('');
    }
  };

  const clearImage = () => {
    releasePreview();
    setImage(null);
    setImagePreview(null);
    setValidationError('');
    // Both file inputs keep their previous value, so re-picking the same photo
    // would fire no change event without this.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const validateInputs = (): boolean => {
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

  const triggerFileSelect = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Photos,
          quality: 90,
          allowEditing: false
        });

        if (photo.dataUrl) {
          const response = await fetch(photo.dataUrl);
          const blob = await response.blob();
          const file = new File([blob], 'gallery-photo.jpg', { type: 'image/jpeg' });
          releasePreview();
          setImage(file);
          setImagePreview(photo.dataUrl);
          setDrugName('');
          setValidationError('');
        }
      } catch (error) {
        console.error('Gallery error:', error);
      }
    } else {
      fileInputRef.current?.click();
    }
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
          releasePreview();
          setImage(file);
          setImagePreview(photo.dataUrl);
          setDrugName(''); // Clear text input when image is selected
          setValidationError('');
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
    <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8 animate-fade-in">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-brand-dark dark:text-white mb-2">{t('homeTitle')}</h1>
        <p className="text-lg text-gray-600 dark:text-[#A1A1AA]">
          {t('homeSubtitle')}
        </p>
      </div>

      {/* Identification Card */}
      <div data-tutorial="search-container" className="bg-white dark:bg-[#1C1C1E] p-6 sm:p-8 rounded-2xl shadow-lg dark:shadow-none w-full transition-colors duration-300">
        <h2 className="text-2xl font-bold text-brand-dark dark:text-white mb-6 text-center">{t('identifyYourMedication')}</h2>

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
            <button onClick={triggerCamera} className="w-full group flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-[#3A4D54] rounded-xl hover:border-brand-primary dark:hover:border-[#90E0EF] hover:bg-brand-accent dark:hover:bg-[#2C2C2E] hover:scale-[1.02] active:scale-95 transition-all duration-300">
               <CameraIcon className="w-12 h-12 text-gray-400 dark:text-[#90E0EF] group-hover:text-brand-primary dark:group-hover:text-white mb-2 transition-colors"/>
               <span className="font-semibold text-brand-dark dark:text-[#90E0EF]">{t('takeAPhoto')}</span>
               <span className="text-sm text-gray-500 dark:text-[#A1A1AA]">{t('useYourCamera')}</span>
            </button>
            <button onClick={triggerFileSelect} className="w-full group flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-[#3A4D54] rounded-xl hover:border-brand-primary dark:hover:border-[#90E0EF] hover:bg-brand-accent dark:hover:bg-[#2C2C2E] hover:scale-[1.02] active:scale-95 transition-all duration-300">
               <DocumentArrowUpIcon className="w-12 h-12 text-gray-400 dark:text-[#90E0EF] group-hover:text-brand-primary dark:group-hover:text-white mb-2 transition-colors"/>
               <span className="font-semibold text-brand-dark dark:text-[#90E0EF]">{t('uploadAnImage')}</span>
               <span className="text-sm text-gray-500 dark:text-[#A1A1AA]">{t('selectFromLibrary')}</span>
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
            <h3 className="font-semibold text-gray-700 dark:text-[#A1A1AA]">{t('imagePreview')}</h3>
            <div className="relative inline-block mt-2">
              <img src={imagePreview} alt="Medication preview" className="rounded-lg max-h-48 shadow-md" />
              {/* Without this, dropping a wrong photo meant typing something instead. */}
              <button
                type="button"
                onClick={clearImage}
                aria-label={t('removePhoto')}
                title={t('removePhoto')}
                className="absolute -top-2 -end-2 p-1.5 rounded-full bg-white dark:bg-[#2C2C2E] text-gray-600 dark:text-white shadow-md border border-gray-200 dark:border-[#3A4D54] hover:bg-gray-100 dark:hover:bg-[#3A4D54] active:scale-90 transition-all"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="relative my-6 flex items-center">
            <div className="flex-grow border-t border-gray-300 dark:border-[#3A4D54]"></div>
            <span className="flex-shrink mx-4 text-gray-500 dark:text-[#A1A1AA] font-semibold">{t('or')}</span>
            <div className="flex-grow border-t border-gray-300 dark:border-[#3A4D54]"></div>
        </div>

        {/* A form, so the phone keyboard offers a search key and Enter submits. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleIdentifyClick();
          }}
        >
          <div className="relative">
              <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 dark:text-[#A1A1AA] absolute start-4 top-1/2 -translate-y-1/2"/>
              <input
                  type="search"
                  enterKeyHint="search"
                  value={drugName}
                  onChange={(e) => {
                    setDrugName(e.target.value);
                    if (image || imagePreview) clearImage();
                  }}
                  placeholder={t('typeDrugNamePlaceholder')}
                  aria-label={t('typeDrugNamePlaceholder')}
                  className="w-full ps-12 pe-4 py-4 border border-gray-300 dark:border-[#3A4D54] rounded-full bg-white dark:bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-primary transition shadow-md [&::-webkit-search-cancel-button]:hidden"
              />
          </div>

          <button
              type="submit"
              disabled={!image && !drugName}
              className="w-full mt-6 bg-gradient-to-r from-brand-primary to-brand-secondary dark:bg-none dark:bg-[#90E0EF] text-white dark:text-[#0D0D0D] font-bold py-4 px-4 rounded-full shadow-lg hover:shadow-xl hover:shadow-brand-primary/40 hover:-translate-y-1 active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:-translate-y-0 disabled:cursor-not-allowed transition-all duration-300"
          >
              {t('findMyMedication')}
          </button>
        </form>
      </div>
    </div>
  );
};
