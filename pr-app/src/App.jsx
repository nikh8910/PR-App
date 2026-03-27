/**
 * @file App.jsx
 * @description Root application component — defines all client-side routes and
 * wraps the app in the global AuthProvider so every screen has access to
 * credentials and the API config.
 *
 * ## Routing Architecture
 * Every route except /login is wrapped in <ProtectedRoute> which redirects
 * unauthenticated users to /login. The route tree mirrors the SAP EWM / S4
 * process flow:
 *
 *  /menu                         — Main menu (hub)
 *  /warehouse-inbound/...        — Inbound deliveries + putaway tasks (INB process)
 *  /warehouse-outbound/...       — Outbound deliveries + picking tasks (OBD process)
 *  /warehouse-internal/...       — Internal movements, adhoc tasks, PI count
 *  /warehouse-stock/...          — Available stock by bin / by product
 *  /warehouse-packing/...        — HU management, packing, HU transfer
 *  /gr, /gi, /gi-reservation ... — Simple goods movement screens
 *  /inventory                    — Physical inventory management
 *
 * ## Android Back Button
 * AppRoutes registers a Capacitor native back-button listener. On /menu or
 * /login, the app exits. On any other screen, it navigates back one step
 * (navigate(-1)), matching the expected mobile UX pattern.
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Menu from './pages/Menu';
import GoodsReceipt from './pages/GoodsReceipt';
import GoodsReceiptSTO from './pages/GoodsReceiptSTO';
import GoodsReceiptProduction from './pages/GoodsReceiptProduction';
import GoodsIssue from './pages/GoodsIssue';
import PhysicalInventory from './pages/PhysicalInventory';
import StockOverview from './pages/StockOverview';
import InboundDelivery from './pages/InboundDelivery';
import GoodsIssueReservation from './pages/GoodsIssueReservation';
import GoodsIssueSTO from './pages/GoodsIssueSTO';
import HandlingUnits from './pages/HandlingUnits';
import WarehouseInbound from './pages/WarehouseInbound';
import WarehouseOutbound from './pages/WarehouseOutbound';
import InboundDeliverySearch from './pages/inbound/InboundDeliverySearch';
import InboundDeliveryList from './pages/inbound/InboundDeliveryList';
import InboundDeliveryDetail from './pages/inbound/InboundDeliveryDetail';
import PutawaySearch from './pages/inbound/PutawaySearch';
import ConfirmPutaway from './pages/inbound/ConfirmPutaway';
import SystemGuidedPutaway from './pages/inbound/SystemGuidedPutaway';
import OutboundDeliverySearch from './pages/outbound/OutboundDeliverySearch';
import OutboundDeliveryList from './pages/outbound/OutboundDeliveryList';
import OutboundDeliveryDetail from './pages/outbound/OutboundDeliveryDetail';
import PickingSearch from './pages/outbound/PickingSearch';
import ConfirmPicking from './pages/outbound/ConfirmPicking';
import SystemGuidedPicking from './pages/outbound/SystemGuidedPicking';
import WarehouseInternal from './pages/WarehouseInternal';
import WarehouseStock from './pages/WarehouseStock';
import WarehousePacking from './pages/WarehousePacking';
import AdhocTaskCreate from './pages/internal/AdhocTaskCreate';
import AdhocTaskConfirm from './pages/internal/AdhocTaskConfirm';
import PICount from './pages/internal/PICount';
import PIAdhocCreate from './pages/internal/PIAdhocCreate';
import ManageWarehouseOrder from './pages/internal/ManageWarehouseOrder';
import ManageResourceSearch from './pages/internal/ManageResourceSearch';
import ManageResourceList from './pages/internal/ManageResourceList';
import StockByBin from './pages/stock/StockByBin';
import StockByProduct from './pages/stock/StockByProduct';
import HUTransfer from './pages/packing/HUTransfer';
import PackProduct from './pages/packing/PackProduct';
import CreateHU from './pages/packing/CreateHU';
import AIChatModal from './components/AIChat/AIChatModal';
import { Bot } from 'lucide-react';

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
        path="/gr-sto"
        element={
          <ProtectedRoute>
            <GoodsReceiptSTO />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gr-production"
        element={
          <ProtectedRoute>
            <GoodsReceiptProduction />
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
        path="/warehouse-inbound"
        element={
          <ProtectedRoute>
            <WarehouseInbound />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-inbound/deliveries"
        element={
          <ProtectedRoute>
            <InboundDeliverySearch />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-inbound/deliveries/list"
        element={
          <ProtectedRoute>
            <InboundDeliveryList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-inbound/deliveries/:warehouse/:id"
        element={
          <ProtectedRoute>
            <InboundDeliveryDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-inbound/putaway"
        element={
          <ProtectedRoute>
            <PutawaySearch />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-inbound/putaway/:warehouse/:taskId/:taskItem"
        element={
          <ProtectedRoute>
            <ConfirmPutaway />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-inbound/system-guided"
        element={
          <ProtectedRoute>
            <SystemGuidedPutaway />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-inbound/system-guided"
        element={
          <ProtectedRoute>
            <SystemGuidedPutaway />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-outbound"
        element={
          <ProtectedRoute>
            <WarehouseOutbound />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-outbound/deliveries"
        element={
          <ProtectedRoute>
            <OutboundDeliverySearch />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-outbound/deliveries/list"
        element={
          <ProtectedRoute>
            <OutboundDeliveryList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-outbound/deliveries/:warehouse/:id"
        element={
          <ProtectedRoute>
            <OutboundDeliveryDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-outbound/picking"
        element={
          <ProtectedRoute>
            <PickingSearch />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-outbound/picking/:warehouse/:taskId/:taskItem"
        element={
          <ProtectedRoute>
            <ConfirmPicking />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-outbound/system-guided"
        element={
          <ProtectedRoute>
            <SystemGuidedPicking />
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
        path="/gi-sto"
        element={
          <ProtectedRoute>
            <GoodsIssueSTO />
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
      <Route path="/handling-units" element={<ProtectedRoute><HandlingUnits /></ProtectedRoute>} />

      {/* Internal Movements */}
      <Route path="/warehouse-internal" element={<ProtectedRoute><WarehouseInternal /></ProtectedRoute>} />
      <Route path="/warehouse-internal/adhoc-task" element={<ProtectedRoute><AdhocTaskCreate /></ProtectedRoute>} />
      <Route path="/warehouse-internal/confirm-task" element={<ProtectedRoute><AdhocTaskConfirm /></ProtectedRoute>} />
      <Route path="/warehouse-internal/phys-inv" element={<ProtectedRoute><PICount /></ProtectedRoute>} />
      <Route path="/warehouse-internal/adhoc-pi" element={<ProtectedRoute><PIAdhocCreate /></ProtectedRoute>} />
      <Route path="/warehouse-internal/manage-wo" element={<ProtectedRoute><ManageWarehouseOrder /></ProtectedRoute>} />
      <Route path="/warehouse-internal/manage-resource" element={<Navigate to="/manage-resource" replace />} />
      <Route path="/manage-resource" element={<ProtectedRoute><ManageResourceSearch /></ProtectedRoute>} />
      <Route path="/manage-resource/list" element={<ProtectedRoute><ManageResourceList /></ProtectedRoute>} />

      {/* Available Stock */}
      <Route path="/warehouse-stock" element={<ProtectedRoute><WarehouseStock /></ProtectedRoute>} />
      <Route path="/warehouse-stock/by-bin" element={<ProtectedRoute><StockByBin /></ProtectedRoute>} />
      <Route path="/warehouse-stock/by-product" element={<ProtectedRoute><StockByProduct /></ProtectedRoute>} />

      {/* Packing */}
      <Route path="/warehouse-packing" element={<ProtectedRoute><WarehousePacking /></ProtectedRoute>} />
      <Route path="/warehouse-packing/hu-transfer" element={<ProtectedRoute><HUTransfer /></ProtectedRoute>} />
      <Route path="/warehouse-packing/pack-product" element={<ProtectedRoute><PackProduct /></ProtectedRoute>} />
      <Route path="/warehouse-packing/create-hu" element={<ProtectedRoute><CreateHU /></ProtectedRoute>} />

      <Route path="/" element={<Navigate to="/menu" replace />} />
    </Routes>
  );
}

const GlobalBotFAB = ({ chatOpen, setChatOpen }) => {
  const location = useLocation();

  // Only show the Bot FAB on the main dashboard screens
  if (location.pathname !== '/menu' && location.pathname !== '/pr' && location.pathname !== '/') {
    return null;
  }

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 999999 }}>
      <button
        onClick={() => setChatOpen(true)}
        style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(to right, #2563eb, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.5)', border: 'none', cursor: 'pointer' }}
        className="hover:scale-105 active:scale-95 transition-all outline-none group"
      >
        <Bot size={28} className="group-hover:animate-bounce" />

        {/* Ping Indicator */}
        <span className="absolute top-0 right-0 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-50"></span>
        </span>
      </button>
    </div>
  );
};

function App() {
  const [chatOpen, setChatOpen] = React.useState(false);

  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <GlobalBotFAB chatOpen={chatOpen} setChatOpen={setChatOpen} />
      </BrowserRouter>

      {/* Global AI Assistant Modal */}
      <AIChatModal isOpen={chatOpen} onClose={() => setChatOpen(false)} />

    </AuthProvider>
  );
}

export default App;
