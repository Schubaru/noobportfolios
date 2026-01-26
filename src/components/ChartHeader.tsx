import { formatCurrency, formatPercent } from '@/lib/portfolio';
import { cn } from '@/lib/utils';

interface ChartHeaderProps {
  value: number;
  change: number;
  changePercent: number;
  isHovering: boolean;
  hoverDate?: string;
}

const ChartHeader = ({
  value,
  change,
  changePercent,
  isHovering,
  hoverDate,
}: ChartHeaderProps) => {
  const isPositive = change > 0;
  const isNeutral = Math.abs(change) < 0.01;

  const changeColor = isNeutral
    ? 'text-muted-foreground'
    : isPositive
    ? 'text-success'
    : 'text-destructive';

  const sign = isPositive ? '+' : '';

  return (
    <div className="mb-4 transition-all duration-150">
      <p className="text-3xl md:text-4xl font-bold tracking-tight">
        {formatCurrency(value)}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <span className={cn('text-sm font-medium', changeColor)}>
          {sign}{formatCurrency(change)}
        </span>
        <span className={cn('text-sm', changeColor)}>
          ({formatPercent(changePercent)})
        </span>
        {isHovering && hoverDate && (
          <span className="text-xs text-muted-foreground ml-2">
            {hoverDate}
          </span>
        )}
      </div>
    </div>
  );
};

export default ChartHeader;
