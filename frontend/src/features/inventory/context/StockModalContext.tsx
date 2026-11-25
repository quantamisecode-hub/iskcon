import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StockInModal } from '../components/StockInModal';
import { StockOutModal } from '../components/StockOutModal';
import type { FoodItemRow } from '../api/inventory.api';

interface StockModalContextValue {
  openStockIn: (item?: FoodItemRow | null, onSuccess?: () => void) => void;
  openStockOut: (item?: FoodItemRow | null, onSuccess?: () => void) => void;
  closeStockIn: () => void;
  closeStockOut: () => void;
}

const StockModalContext = createContext<StockModalContextValue | null>(null);

export function StockModalProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [isStockInOpen, setIsStockInOpen] = useState(false);
  const [stockInItem, setStockInItem] = useState<FoodItemRow | null>(null);
  const [stockInCallback, setStockInCallback] = useState<(() => void) | null>(null);

  const [isStockOutOpen, setIsStockOutOpen] = useState(false);
  const [stockOutItem, setStockOutItem] = useState<FoodItemRow | null>(null);
  const [stockOutCallback, setStockOutCallback] = useState<(() => void) | null>(null);

  // Sync with URL parameters (e.g. sidebar navigation /inventory?stockIn=1)
  useEffect(() => {
    if (searchParams.get('stockIn') === '1') {
      setStockInItem(null);
      setIsStockInOpen(true);
    } else if (searchParams.get('stockOut') === '1') {
      setStockOutItem(null);
      setIsStockOutOpen(true);
    }
  }, [searchParams]);

  const openStockIn = (item?: FoodItemRow | null, onSuccess?: () => void) => {
    setStockInItem(item ?? null);
    setStockInCallback(onSuccess ? () => onSuccess : null);
    setIsStockInOpen(true);
  };

  const closeStockIn = () => {
    setIsStockInOpen(false);
    setStockInItem(null);
    setStockInCallback(null);
    if (searchParams.has('stockIn')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('stockIn');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const openStockOut = (item?: FoodItemRow | null, onSuccess?: () => void) => {
    setStockOutItem(item ?? null);
    setStockOutCallback(onSuccess ? () => onSuccess : null);
    setIsStockOutOpen(true);
  };

  const closeStockOut = () => {
    setIsStockOutOpen(false);
    setStockOutItem(null);
    setStockOutCallback(null);
    if (searchParams.has('stockOut')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('stockOut');
      setSearchParams(nextParams, { replace: true });
    }
  };

  return (
    <StockModalContext.Provider
      value={{
        openStockIn,
        openStockOut,
        closeStockIn,
        closeStockOut,
      }}
    >
      {children}

      {/* Global Stock In Modal */}
      <StockInModal
        isOpen={isStockInOpen}
        onClose={closeStockIn}
        preselectedItem={stockInItem}
        onSuccess={() => {
          stockInCallback?.();
        }}
      />

      {/* Global Stock Out Modal */}
      <StockOutModal
        isOpen={isStockOutOpen}
        onClose={closeStockOut}
        preselectedItem={stockOutItem}
        onSuccess={() => {
          stockOutCallback?.();
        }}
      />
    </StockModalContext.Provider>
  );
}

export function useStockModals(): StockModalContextValue {
  const context = useContext(StockModalContext);
  if (!context) {
    throw new Error('useStockModals must be used within a StockModalProvider');
  }
  return context;
}
