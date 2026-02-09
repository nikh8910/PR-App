import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Menu from './pages/Menu';
import GoodsReceipt from './pages/GoodsReceipt';
import GoodsIssue from './pages/GoodsIssue';
import PhysicalInventory from './pages/PhysicalInventory';
import StockOverview from './pages/StockOverview';
import InboundDelivery from './pages/InboundDelivery';
import GoodsIssueReservation from './pages/GoodsIssueReservation';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const AppRoutes = () => {
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    const handleBackButton = async ({ canGoBack }) => {
      if (location.pathname === '/menu' || location.pathname === '/login') {
        CapApp.exitApp();
      } else {
        navigate(-1);
      }
    };

    const listener = CapApp.addListener('backButton', handleBackButton);

    return () => {
      listener.then(remove => remove.remove());
    };
  }, [navigate, location]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/menu"
        element={
          <ProtectedRoute>
            <Menu />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pr"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gr"
        element={
          <ProtectedRoute>
            <GoodsReceipt />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gr-inbound"
        element={
          <ProtectedRoute>
            <InboundDelivery />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gi"
        element={
          <ProtectedRoute>
            <GoodsIssue />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gi-reservation"
        element={
          <ProtectedRoute>
            <GoodsIssueReservation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <PhysicalInventory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stock"
        element={
          <ProtectedRoute>
            <StockOverview />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/menu" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
