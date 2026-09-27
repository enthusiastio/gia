declare global {
  interface Window {
    gapi: {
      load: (lib: string, cb: () => void) => void;
      client: { setToken: (t: { access_token: string }) => void };
    };
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
      picker: {
        PickerBuilder: new () => PickerBuilder;
        DocsView: new () => DocsView;
        Action: { PICKED: string; CANCEL: string };
      };
    };
  }
}

interface PickerBuilder {
  addView(view: DocsView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setCallback(cb: (data: PickerData) => void): PickerBuilder;
  build(): { setVisible: (v: boolean) => void };
}

interface DocsView {
  setIncludeFolders(v: boolean): DocsView;
  setMimeTypes(types: string): DocsView;
}

interface PickerData {
  action: string;
  docs?: Array<{ id: string; name: string; mimeType: string }>;
}

const SUPPORTED_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv', 'text/markdown',
  'application/json',
].join(',');

let gapiLoaded = false;
let gisLoaded = false;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureLoaded(): Promise<void> {
  if (!gapiLoaded) {
    await loadScript('https://apis.google.com/js/api.js');
    await new Promise<void>((resolve) => window.gapi.load('picker', resolve));
    gapiLoaded = true;
  }
  if (!gisLoaded) {
    await loadScript('https://accounts.google.com/gsi/client');
    gisLoaded = true;
  }
}

export async function openGoogleDrivePicker(): Promise<File | null> {
  await ensureLoaded();

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set');

  return new Promise((resolve) => {
    let accessToken = '';

    const showPicker = () => {
      const view = new window.google.picker.DocsView()
        .setIncludeFolders(false)
        .setMimeTypes(SUPPORTED_MIME_TYPES);

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setCallback(async (data: PickerData) => {
          if (data.action === window.google.picker.Action.PICKED && data.docs?.[0]) {
            const doc = data.docs[0];
            try {
              const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (!response.ok) throw new Error('Download failed');
              const blob = await response.blob();
              resolve(new File([blob], doc.name, { type: doc.mimeType }));
            } catch {
              resolve(null);
            }
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();

      picker.setVisible(true);
    };

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (resp) => {
        if (resp.access_token) {
          accessToken = resp.access_token;
          showPicker();
        } else {
          resolve(null);
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: '' });
  });
}
