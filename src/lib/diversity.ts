import { Holding, AssetClass } from './types';
import { calculateHoldingsValue } from './portfolio';

export interface DiversityAnalysis {
  score: number;
  factors: {
    assetClassDiversity: number;
    concentrationPenalty: number;
    holdingCount: number;
  };
  recommendations: string[];
}

export const calculateDiversityScore = (holdings: Holding[]): DiversityAnalysis => {
  if (holdings.length === 0) {
    return {
      score: 0,
      factors: { assetClassDiversity: 0, concentrationPenalty: 0, holdingCount: 0 },
      recommendations: ['Start by adding some holdings to your portfolio.'],
    };
  }

  const totalValue = calculateHoldingsValue(holdings);
  if (totalValue === 0) {
    return {
      score: 0,
      factors: { assetClassDiversity: 0, concentrationPenalty: 0, holdingCount: 0 },
      recommendations: ['Your holdings have no value yet.'],
    };
  }

  // Calculate position weights
  const positions = holdings.map(h => ({
    ...h,
    value: (h.currentPrice || h.avgCost) * h.shares,
    weight: ((h.currentPrice || h.avgCost) * h.shares) / totalValue,
  })).sort((a, b) => b.weight - a.weight);

  // Asset class diversity (0-40 points)
  const assetClasses = new Set(holdings.map(h => h.assetClass));
  const assetClassCount = assetClasses.size;
  const assetClassDiversity = Math.min(40, assetClassCount * 10);

  // Concentration penalty (0-30 points deducted)
  let concentrationPenalty = 0;
  const recommendations: string[] = [];

  // Top holding > 40%
  if (positions[0] && positions[0].weight > 0.4) {
    concentrationPenalty += 15;
    recommendations.push(`${positions[0].symbol} is ${(positions[0].weight * 100).toFixed(1)}% of your portfolio. Consider reducing exposure.`);
  }

  // Top 3 holdings > 70%
  const top3Weight = positions.slice(0, 3).reduce((sum, p) => sum + p.weight, 0);
  if (top3Weight > 0.7) {
    concentrationPenalty += 10;
    recommendations.push('Your top 3 holdings are over 70% of your portfolio. Consider diversifying.');
  }

  // Single asset class > 60%
  const assetClassWeights: Record<AssetClass, number> = {
    stock: 0, etf: 0, bond: 0, reit: 0, crypto: 0, other: 0,
  };
  positions.forEach(p => {
    assetClassWeights[p.assetClass] += p.weight;
  });
  
  Object.entries(assetClassWeights).forEach(([assetClass, weight]) => {
    if (weight > 0.6) {
      concentrationPenalty += 5;
      recommendations.push(`${assetClass.toUpperCase()}s are ${(weight * 100).toFixed(1)}% of your portfolio. Consider adding other asset classes.`);
    }
  });

  // Holding count bonus (0-30 points)
  const holdingCount = Math.min(30, holdings.length * 5);

  // Calculate final score
  const rawScore = assetClassDiversity + holdingCount - concentrationPenalty;
  const score = Math.max(0, Math.min(100, rawScore));

  if (recommendations.length === 0) {
    if (score >= 80) {
      recommendations.push('Great diversification! Your portfolio is well-balanced.');
    } else if (score >= 50) {
      recommendations.push('Good start! Consider adding more asset classes for better diversification.');
    } else {
      recommendations.push('Consider adding more holdings across different asset classes.');
    }
  }

  return {
    score,
    factors: {
      assetClassDiversity,
      concentrationPenalty,
      holdingCount,
    },
    recommendations,
  };
};

export const getDiversityColor = (score: number): string => {
  if (score >= 80) return 'hsl(var(--success))';
  if (score >= 50) return 'hsl(var(--primary))';
  if (score >= 25) return 'hsl(45, 93%, 47%)'; // Warning yellow
  return 'hsl(var(--destructive))';
};

export const getDiversityLabel = (score: number): string => {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Poor';
  return 'Very Poor';
};
