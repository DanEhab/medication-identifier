/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/*
  The camera torch is a real, widely implemented constraint on Android, but it
  is not in TypeScript's DOM library. Declaring it here keeps the camera code
  free of casts and means the compiler still checks how it is used.
*/
interface MediaTrackCapabilities {
  torch?: boolean;
}

interface MediaTrackConstraintSet {
  torch?: ConstrainBoolean;
}
