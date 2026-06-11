import { apiJson, apiJsonSafe, apiUrl } from '@/lib/api';

export type BambuPrinter = {
  id: string;
  name: string;
  host: string;
  serial: string;
  access_code: string;
  model: string;
  created_at: string;
};

export type BambuAMSTray = {
  id: number;
  name?: string;
  color?: string;
};

export type BambuStatus = {
  online: boolean;
  updated_at?: string;
  state?: string;
  stage_description?: string;
  gcode_file?: string;
  subtask_name?: string;
  progress: number;
  layer_num: number;
  total_layers: number;
  remaining_min: number;
  nozzle_target: number;
  nozzle_temper: number;
  bed_target: number;
  bed_temper: number;
  chamber_temper: number;
  wifi_signal?: string;
  fan_cool: number;
  fan_aux: number;
  fan_chamber: number;
  nozzle_type?: string;
  hms?: string[];
  ams_trays?: BambuAMSTray[];
  light_on?: boolean;
  last_error?: string;
};

export const bambuApi = {
  list: () => apiJsonSafe<BambuPrinter[]>('/api/bambu/printers'),
  add: (p: Partial<BambuPrinter>) =>
    apiJson<BambuPrinter>('/api/bambu/printers', {
      method: 'POST',
      body: JSON.stringify(p),
    }),
  update: (id: string, p: Partial<BambuPrinter>) =>
    apiJson<BambuPrinter>(`/api/bambu/printers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(p),
    }),
  remove: (id: string) =>
    apiJson<{ ok: boolean }>(`/api/bambu/printers/${id}`, { method: 'DELETE' }),
  status: (id: string) =>
    apiJsonSafe<BambuStatus>(`/api/bambu/printers/${id}/status`),
  cameraUrl: (id: string) => apiUrl(`/api/bambu/printers/${id}/camera`),
  snapshotUrl: (id: string) => apiUrl(`/api/bambu/printers/${id}/snapshot`),

  command: (id: string, action: BambuAction, args?: Record<string, unknown>) =>
    apiJson<{ ok: boolean }>(`/api/bambu/printers/${id}/command`, {
      method: 'POST',
      body: JSON.stringify({ action, args: args ?? {} }),
    }),

  listFiles: (id: string) =>
    apiJsonSafe<BambuFile[]>(`/api/bambu/printers/${id}/files`),

  upload: (id: string, file: File, onProgress?: (pct: number) => void) =>
    new Promise<{ path: string; name: string }>((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl(`/api/bambu/printers/${id}/upload`));
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        try {
          const body = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(body);
          else reject(new Error(body?.error ?? `upload failed (${xhr.status})`));
        } catch (e) {
          reject(e);
        }
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.send(fd);
    }),

  print: (id: string, req: BambuPrintRequest) =>
    apiJson<{ ok: boolean }>(`/api/bambu/printers/${id}/print`, {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  deleteFile: (id: string, path: string) =>
    apiJson<{ ok: boolean }>(
      `/api/bambu/printers/${id}/files?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' },
    ),

  downloadUrl: (id: string, path: string) =>
    apiUrl(
      `/api/bambu/printers/${id}/files/download?path=${encodeURIComponent(path)}`,
    ),
};

export type BambuAction =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'light'
  | 'speed'
  | 'nozzle_temp'
  | 'bed_temp'
  | 'fan'
  | 'aux_fan'
  | 'chamber_fan'
  | 'home'
  | 'unload_filament';

export type BambuFile = {
  name: string;
  path: string;
  size: number;
  modified?: string;
  is_dir: boolean;
};

export type BambuPrintRequest = {
  filename: string; // printer-side path returned by upload()
  plate: number; // 1-based
  use_ams: boolean;
  bed_leveling: boolean;
  flow_calibration: boolean;
  vibration_cal: boolean;
  layer_inspect: boolean;
  timelapse: boolean;
  ams_mapping?: number[];
};
