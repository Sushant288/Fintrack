// M0: Route table
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Categories from './pages/Categories';
import Budgets from './pages/Budgets';
import Recurring from './pages/Recurring';
import Goals from './pages/Goals';
import Reports from './pages/Reports';
import ImportWizard from './pages/ImportWizard';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/import" element={<ImportWizard />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
