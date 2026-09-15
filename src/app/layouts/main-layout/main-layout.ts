import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  canAccessFlotilla,
  canAccessInicio,
  canAccessUsuarios,
  canAccessVentas,
  canAccessVisitas,
} from '../../utils/roles';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.html',
})
export class MainLayout {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly sidebarOpen = signal(false);

  readonly showInicio = computed(() => canAccessInicio(this.auth.user()?.rol));
  readonly showFlotilla = computed(() => canAccessFlotilla(this.auth.user()?.rol));
  readonly showVentas = computed(() => canAccessVentas(this.auth.user()?.rol));
  readonly showVisitas = computed(() => canAccessVisitas(this.auth.user()?.rol));
  readonly showUsuarios = computed(() => canAccessUsuarios(this.auth.user()?.rol));

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.sidebarOpen.set(false));
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }
}
