import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import AIAnalysis from "./pages/AIAnalysis";
import Watchlist from "./pages/Watchlist";
import Review from "./pages/Review";
import Sector from "./pages/Sector";
import RiskSignal from "./pages/RiskSignal";
import MacroRisk from "./pages/MacroRisk";
import Notes from "./pages/Notes";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

const App: React.FC = () => (
  <Routes>
    <Route element={<Layout />}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/ai-analysis" element={<AIAnalysis />} />
      <Route path="/watchlist" element={<Watchlist />} />
      <Route path="/review" element={<Review />} />
      <Route path="/review/:date" element={<Review />} />
      <Route path="/sector" element={<Sector />} />
      <Route path="/risk-signal" element={<RiskSignal />} />
      <Route path="/macro-risk" element={<MacroRisk />} />
      <Route path="/notes" element={<Notes />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
);

export default App;
