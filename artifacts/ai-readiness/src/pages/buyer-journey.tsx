// Redirected — content merged into AEO Score page
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BuyerJourneyRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/intelligence/aeo", { replace: true }); }, [navigate]);
  return null;
}
