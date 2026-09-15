import { Routes } from '@angular/router';
import {
  authGuard,
  flotillaGuard,
  guestGuard,
  inicioGuard,
  usuariosGuard,
  ventasGuard,
  visitasGuard,
} from './guards/auth.guard';
import { MainLayout } from './layouts/main-layout/main-layout';
import { HomePage } from './pages/home/home-page';
import { LoginPage } from './pages/login/login-page';
import { PedidosPage } from './pages/pedidos/pedidos-page';
import { PedidosComercialesPage } from './pages/ventas/pedidos-comerciales-page';
import { PedidoComercialFormPage } from './pages/ventas/pedido-comercial-form-page';
import { VisitasPage } from './pages/ventas/visitas-page';
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
      { path: '', component: HomePage, canActivate: [inicioGuard] },
      { path: 'usuarios', component: UsuariosPage, canActivate: [usuariosGuard] },
      { path: 'pedidos', component: PedidosPage, canActivate: [flotillaGuard] },
      { path: 'rutas', component: RutasPage, canActivate: [flotillaGuard] },
      { path: 'rutas/:id', component: RutaDetallePage, canActivate: [flotillaGuard] },
      {
        path: 'ventas/visitas',
        component: VisitasPage,
        canActivate: [visitasGuard],
      },
      {
        path: 'ventas/pedidos/nuevo',
        component: PedidoComercialFormPage,
        canActivate: [ventasGuard],
      },
      {
        path: 'ventas/pedidos/:id',
        component: PedidoComercialFormPage,
        canActivate: [ventasGuard],
      },
      {
        path: 'ventas/pedidos',
        component: PedidosComercialesPage,
        canActivate: [ventasGuard],
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];