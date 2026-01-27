import { TimeRange } from '@/lib/timeRange';
import { cn } from '@/lib/utils';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const TIME_RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'];

const TimeRangeSelector = ({ value, onChange }: TimeRangeSelectorProps) => {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {TIME_RANGES.map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
            value === range
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          {range}
        </button>
      ))}
    </div>
  );
};

export default TimeRangeSelector;
