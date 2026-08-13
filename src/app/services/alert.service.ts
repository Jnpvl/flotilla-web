import { Injectable } from '@angular/core';
import Swal, { type SweetAlertIcon, type SweetAlertResult } from 'sweetalert2';

@Injectable({ providedIn: 'root' })
export class AlertService {
  success(title: string, text?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'success',
      title,
      text,
      confirmButtonColor: '#2563eb',
    });
  }

  error(title: string, text?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'error',
      title,
      text,
      confirmButtonColor: '#2563eb',
    });
  }

  info(title: string, text?: string): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'info',
      title,
      text,
      confirmButtonColor: '#2563eb',
    });
  }

  confirm(title: string, text?: string): Promise<boolean> {
    return Swal.fire({
      icon: 'warning' as SweetAlertIcon,
      title,
      text,
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#6b7280',
      reverseButtons: true,
    }).then((result) => result.isConfirmed);
  }
}
