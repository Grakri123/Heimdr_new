"use client";
import { useEffect } from "react";

export default function ConnectSuccessPage() {
  useEffect(() => {
    // Prøv å lukke vinduet automatisk etter 1.5 sekunder
    const timer = setTimeout(() => {
      if (window.opener) {
        window.close();
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleManualClose = () => {
    window.close();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#232323] to-[#181818]">
      <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center max-w-md mx-auto">
        <h2 className="text-2xl font-semibold text-green-700 mb-4 text-center">Tilkobling fullført!</h2>
        <p className="text-gray-700 mb-6 text-center">Du kan nå lukke dette vinduet.<br />Hovedsiden oppdateres automatisk.</p>
        <button
          onClick={handleManualClose}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg shadow-md transition-colors"
        >
          Lukk vindu
        </button>
      </div>
    </div>
  );
} 