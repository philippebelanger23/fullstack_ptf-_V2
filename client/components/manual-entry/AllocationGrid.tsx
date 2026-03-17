import React from 'react';
import { AllocationPeriod, TickerRow } from './useManualEntryState';
import { TickerForm, TickerFormProps } from './TickerForm';
import { PeriodManager, PeriodManagerProps } from './PeriodManager';

export interface AllocationGridProps extends TickerFormProps, PeriodManagerProps {}

export const AllocationGrid: React.FC<AllocationGridProps> = (props) => {
    const tickerFormProps: TickerFormProps = {
        displayTickers: props.displayTickers,
        newTickerInput: props.newTickerInput,
        setNewTickerInput: props.setNewTickerInput,
        handleAddTicker: props.handleAddTicker,
        handleRemoveTicker: props.handleRemoveTicker,
        handleToggleMutualFund: props.handleToggleMutualFund,
        handleToggleEtf: props.handleToggleEtf,
    };

    const periodManagerProps: PeriodManagerProps = {
        filteredPeriods: props.filteredPeriods,
        periods: props.periods,
        displayTickers: props.displayTickers,
        handleRemovePeriod: props.handleRemovePeriod,
        handleDateChange: props.handleDateChange,
        handleWeightChange: props.handleWeightChange,
        handleWeightBlur: props.handleWeightBlur,
        calculateTotal: props.calculateTotal,
        handleAddPeriod: props.handleAddPeriod,
    };

    return (
        <div className="flex-1 overflow-auto">
            <div className="flex items-start p-6 min-w-max relative">
                <TickerForm {...tickerFormProps} />
                <PeriodManager {...periodManagerProps} />
            </div>
        </div>
    );
};
