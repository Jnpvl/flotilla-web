import { Injectable } from '@angular/core';
import Swal, { type SweetAlertIcon, type SweetAlertResult } from 'sweetalert2';

const ToastDefaults = Swal.mixin({
  allowOutsideClick: false,
  allowEscapeKey: false,
  confirmButtonColor: '#005f71',
});

@Injectable({ providedIn: 'root' })
export class AlertService {
  success(title: string, text?: string): Promise<SweetAlertResult> {
    return ToastDefaults.fire({
      icon: 'success',
      title,
      text,
    });
  }

  error(title: string, text?: string): Promise<SweetAlertResult> {
    return ToastDefaults.fire({
      icon: 'error',
      title,
      text,
    });
  }

  info(title: string, text?: string): Promise<SweetAlertResult> {
    const multiline = Boolean(text?.includes('\n'));
    return ToastDefaults.fire({
      icon: 'info',
      title,
      ...(multiline
        ? {
            html: (text ?? '')
              .split('\n')
              .map((line) =>
                line
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;'),
              )
              .join('<br>'),
          }
        : { text }),
    });
  }

  confirm(title: string, text?: string): Promise<boolean> {
    const multiline = Boolean(text?.includes('\n'));
    return ToastDefaults.fire({
      icon: 'warning' as SweetAlertIcon,
      title,
      ...(multiline
        ? {
            html: (text ?? '')
              .split('\n')
              .map((line) =>
                line
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;'),
              )
              .join('<br>'),
          }
        : { text }),
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'Cancelar',
      cancelButtonColor: '#6b7280',
      reverseButtons: true,
    }).then((result) => result.isConfirmed);
  }

  /** Sí / No; null si cancela. */
  askYesNo(title: string): Promise<boolean | null> {
    return ToastDefaults.fire({
      icon: 'question' as SweetAlertIcon,
      title,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Sí',
      denyButtonText: 'No',
      cancelButtonText: 'Volver',
      cancelButtonColor: '#6b7280',
      denyButtonColor: '#6b7280',
      reverseButtons: true,
    }).then((result) => {
      if (result.isConfirmed) return true;
      if (result.isDenied) return false;
      return null;
    });
  }

  /** Pide un motivo obligatorio (cancelar / eliminar visita, etc.). */
  promptMotivo(
    title: string,
    options?: { label?: string; confirmText?: string; placeholder?: string },
  ): Promise<string | null> {
    return ToastDefaults.fire({
      icon: 'warning' as SweetAlertIcon,
      title,
      input: 'textarea',
      inputLabel: options?.label ?? 'Motivo',
      inputPlaceholder: options?.placeholder ?? 'Escribe el motivo…',
      inputAttributes: { maxlength: '500' },
      showCancelButton: true,
      confirmButtonText: options?.confirmText ?? 'Confirmar',
      cancelButtonText: 'Volver',
      cancelButtonColor: '#6b7280',
      reverseButtons: true,
      inputValidator: (value) => {
        if (!value || !String(value).trim()) {
          return 'Este campo es obligatorio';
        }
        return null;
      },
    }).then((result) => {
      if (!result.isConfirmed) return null;
      return String(result.value ?? '').trim();
    });
  }
}
