import { Holding, AllocationItem, AssetClass } from './types';

const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  stock: 'hsl(190, 100%, 50%)',
  etf: 'hsl(280, 80%, 60%)',
  bond: 'hsl(142, 76%, 45%)',
  reit: 'hsl(45, 93%, 47%)',
  crypto: 'hsl(320, 80%, 55%)',
  other: 'hsl(220, 10%, 50%)',
};

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  stock: 'Stocks',
  etf: 'ETFs',
  bond: 'Bonds',
  reit: 'REITs',
  crypto: 'Crypto',
  other: 'Other',
};

export const calculateAllocation = (holdings: Holding[]): AllocationItem[] => {
  if (holdings.length === 0) return [];

  const totalValue = holdings.reduce(
    (sum, h) => sum + (h.currentPrice || h.avgCost) * h.shares,
    0
  );

  if (totalValue === 0) return [];

  const byClass: Record<AssetClass, number> = {
    stock: 0, etf: 0, bond: 0, reit: 0, crypto: 0, other: 0,
  };

  holdings.forEach(h => {
    const value = (h.currentPrice || h.avgCost) * h.shares;
    byClass[h.assetClass] += value;
  });

  return (Object.entries(byClass) as [AssetClass, number][])
    .filter(([_, value]) => value > 0)
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      percentage: (value / totalValue) * 100,
      color: ASSET_CLASS_COLORS[assetClass],
    }))
    .sort((a, b) => b.value - a.value);
};

export const getAssetClassLabel = (assetClass: AssetClass): string => {
  return ASSET_CLASS_LABELS[assetClass];
};

export const getAssetClassColor = (assetClass: AssetClass): string => {
  return ASSET_CLASS_COLORS[assetClass];
};
