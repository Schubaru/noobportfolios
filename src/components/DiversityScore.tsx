import { useMemo } from 'react';
import { Shield, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Holding } from '@/lib/types';
import { calculateDiversityScore, getDiversityColor, getDiversityLabel } from '@/lib/diversity';

interface DiversityScoreProps {
  holdings: Holding[];
}

const DiversityScore = ({ holdings }: DiversityScoreProps) => {
  const analysis = useMemo(() => calculateDiversityScore(holdings), [holdings]);
  
  const scoreColor = getDiversityColor(analysis.score);
  const scoreLabel = getDiversityLabel(analysis.score);
  
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (analysis.score / 100) * circumference;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Diversity Score</h3>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="8"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke={scoreColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold" style={{ color: scoreColor }}>
              {analysis.score}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {scoreLabel}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          {analysis.recommendations.slice(0, 2).map((rec, index) => {
            const isPositive = rec.toLowerCase().includes('great') || rec.toLowerCase().includes('well');
            const Icon = isPositive ? CheckCircle : (analysis.score < 40 ? AlertTriangle : Info);
            
            return (
              <div key={index} className="flex items-start gap-2">
                <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                  isPositive ? 'text-success' : (analysis.score < 40 ? 'text-destructive' : 'text-muted-foreground')
                }`} />
                <p className="text-xs text-muted-foreground">{rec}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DiversityScore;
