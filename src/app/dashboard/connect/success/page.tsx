"use client";
import { useEffect } from "react";

export default function ConnectSuccessPage() {
  useEffect(() => {
    // Send beskjed til hovedvinduet om å oppdatere dashboard
    if (window.opener) {
      window.opener.postMessage({ type: "heimdr-connected" }, "*");
    }
    // Redirect til dashboard etter 2 sekunder
    const timer = setTimeout(() => {
      if (window.opener) {
        window.location.href = "/dashboard";
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#232323] to-[#181818]">
      <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center max-w-md mx-auto">
        <h2 className="text-2xl font-semibold text-green-700 mb-4 text-center">Du er tilkoblet og blir nå sendt tilbake til dashbord</h2>
      </div>
    </div>
  );
} 