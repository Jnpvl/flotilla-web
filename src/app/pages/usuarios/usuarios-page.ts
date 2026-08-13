import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertService } from '../../services/alert.service';
import {
  type RolUsuario,
  type Usuario,
  UsuarioService,
} from '../../services/usuario.service';

@Component({
  selector: 'app-usuarios-page',
  imports: [ReactiveFormsModule],
  templateUrl: './usuarios-page.html',
})
export class UsuariosPage implements OnInit {
  private readonly usuariosApi = inject(UsuarioService);
  private readonly alerts = inject(AlertService);
  private readonly fb = inject(FormBuilder);

  readonly usuarios = signal<Usuario[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly roles: RolUsuario[] = ['admin', 'auxiliar', 'chofer'];

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required]],
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
    rol: ['auxiliar' as RolUsuario, [Validators.required]],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.usuariosApi.list().subscribe({
      next: (data) => {
        this.usuarios.set(data);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        void this.alerts.error('Error', this.errorMessage(err, 'No se pudieron cargar los usuarios'));
      },
    });
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({
      nombre: '',
      username: '',
      password: '',
      rol: 'auxiliar',
    });
    this.form.controls.password.setValidators([Validators.required]);
    this.form.controls.password.updateValueAndValidity();
    this.showForm.set(true);
  }

  openEdit(usuario: Usuario): void {
    this.editingId.set(usuario.id);
    this.form.reset({
      nombre: usuario.nombre,
      username: usuario.username,
      password: '',
      rol: usuario.rol,
    });
    this.form.controls.password.clearValidators();
    this.form.controls.password.updateValueAndValidity();
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const editingId = this.editingId();
    this.saving.set(true);

    if (editingId === null) {
      this.usuariosApi.create(value).subscribe({
        next: async () => {
          this.saving.set(false);
          this.closeForm();
          await this.alerts.success('Usuario creado', 'El usuario se dio de alta correctamente');
          this.load();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          void this.alerts.error('No se pudo crear', this.errorMessage(err));
        },
      });
      return;
    }

    const payload = {
      nombre: value.nombre,
      username: value.username,
      rol: value.rol,
      ...(value.password ? { password: value.password } : {}),
    };

    this.usuariosApi.update(editingId, payload).subscribe({
      next: async () => {
        this.saving.set(false);
        this.closeForm();
        await this.alerts.success('Usuario actualizado', 'Los cambios se guardaron correctamente');
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alerts.error('No se pudo actualizar', this.errorMessage(err));
      },
    });
  }

  async askRemove(usuario: Usuario): Promise<void> {
    const confirmed = await this.alerts.confirm(
      '¿Eliminar usuario?',
      `Se eliminará a ${usuario.nombre} (${usuario.username}). Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    this.usuariosApi.remove(usuario.id).subscribe({
      next: async () => {
        await this.alerts.success('Usuario eliminado');
        this.load();
      },
      error: (err: unknown) => {
        void this.alerts.error('No se pudo eliminar', this.errorMessage(err));
      },
    });
  }

  rolLabel(rol: RolUsuario): string {
    const labels: Record<RolUsuario, string> = {
      admin: 'Admin',
      auxiliar: 'Auxiliar',
      chofer: 'Chofer',
    };
    return labels[rol];
  }

  rolClass(rol: RolUsuario): string {
    const classes: Record<RolUsuario, string> = {
      admin: 'bg-gray-100 text-gray-700',
      auxiliar: 'bg-blue-50 text-blue-700',
      chofer: 'bg-orange-50 text-orange-700',
    };
    return classes[rol];
  }

  private errorMessage(err: unknown, fallback = 'Ocurrió un error'): string {
    if (err instanceof HttpErrorResponse) {
      if (typeof err.error?.message === 'string') return err.error.message;
      if (err.status === 0) return 'No hay conexión con el servidor';
    }
    return fallback;
  }
}
