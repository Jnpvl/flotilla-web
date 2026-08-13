import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth.guard';
import { MainLayout } from './layouts/main-layout/main-layout';
import { HomePage } from './pages/home/home-page';
import { LoginPage } from './pages/login/login-page';
import { PedidosPage } from './pages/pedidos/pedidos-page';
import { RutasPage } from './pages/rutas/rutas-page';
import { RutaDetallePage } from './pages/rutas/ruta-detalle-page';
import { UsuariosPage } from './pages/usuarios/usuarios-page';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginPage,
    canActivate: [guestGuard],
  },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      { path: '', component: HomePage },
      { path: 'usuarios', component: UsuariosPage },
      { path: 'pedidos', component: PedidosPage },
      { path: 'rutas', component: RutasPage },
      { path: 'rutas/:id', component: RutaDetallePage },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
