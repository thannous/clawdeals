import { web } from "@e2e-dev/web";

export const desktopEngine = web({ viewport: { width: 1280, height: 720 } });
export const mobileEngine = web({ viewport: { width: 390, height: 844 } });
