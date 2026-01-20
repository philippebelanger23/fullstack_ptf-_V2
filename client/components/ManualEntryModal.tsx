import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calendar, AlertCircle, Save } from 'lucide-react';
import { PortfolioItem } from '../types';

interface ManualEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: PortfolioItem[]) => void;
    existingData?: PortfolioItem[];
}

interface AllocationPeriod {
    id: string;
    startDate: string;
    endDate: string | 'Present';
    weights: Record<string, string>; // ticker -> weight (string for inputs)
}

interface TickerRow {
    ticker: string;
    name?: string; // Optional company name
}

const DEFAULT_TICKERS: TickerRow[] = [
    {
        "ticker": "$CASH$"
    },
    {
        "ticker": "MKB.TO"
    },
    {
        "ticker": "BIP791"
    },
    {
        "ticker": "DJT03868"
    },
    {
        "ticker": "BILLET US BANK"
    },
    {
        "ticker": "TDB3173"
    },
    {
        "ticker": "DYN245"
    },
    {
        "ticker": "MFC8625"
    },
    {
        "ticker": "BRK-B"
    },
    {
        "ticker": "BA"
    },
    {
        "ticker": "GOOGL"
    },
    {
        "ticker": "CRWD"
    },
    {
        "ticker": "MSFT"
    },
    {
        "ticker": "UNH"
    },
    {
        "ticker": "FNV.TO"
    },
    {
        "ticker": "CTC-A.TO"
    },
    {
        "ticker": "BNS.TO"
    },
    {
        "ticker": "RY.TO"
    },
    {
        "ticker": "TD.TO"
    },
    {
        "ticker": "T.TO"
    },
    {
        "ticker": "CCO.TO"
    },
    {
        "ticker": "ENB.TO"
    },
    {
        "ticker": "SU.TO"
    },
    {
        "ticker": "CVE.TO"
    },
    {
        "ticker": "CP.TO"
    },
    {
        "ticker": "WCN.TO"
    },
    {
        "ticker": "AFN.TO"
    },
    {
        "ticker": "WSP.TO"
    },
    {
        "ticker": "MRU.TO"
    },
    {
        "ticker": "ATD.TO"
    },
    {
        "ticker": "XUS.TO"
    },
    {
        "ticker": "TECH-B.TO"
    },
    {
        "ticker": "CRM"
    },
    {
        "ticker": "CM.TO"
    },
    {
        "ticker": "AMZN"
    },
    {
        "ticker": "PANW"
    },
    {
        "ticker": "COST"
    },
    {
        "ticker": "CPX.TO"
    }
];

const DEFAULT_PERIODS: AllocationPeriod[] = [
    {
        "id": "p1",
        "startDate": "2024-12-31",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "6.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "1.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "2.75",
            "CCO.TO": "1.50",
            "ENB.TO": "0.00",
            "SU.TO": "3.00",
            "CVE.TO": "2.75",
            "CP.TO": "1.65",
            "WCN.TO": "0.00",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "2.00",
            "XUS.TO": "0.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p2",
        "startDate": "2025-01-31",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "6.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "1.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "2.75",
            "CCO.TO": "1.50",
            "ENB.TO": "0.00",
            "SU.TO": "3.00",
            "CVE.TO": "2.75",
            "CP.TO": "1.65",
            "WCN.TO": "0.00",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "2.00",
            "XUS.TO": "0.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p3",
        "startDate": "2025-02-20",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "1.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "2.75",
            "CCO.TO": "1.50",
            "ENB.TO": "0.00",
            "SU.TO": "3.00",
            "CVE.TO": "2.75",
            "CP.TO": "1.65",
            "WCN.TO": "0.00",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "2.00",
            "XUS.TO": "6.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p4",
        "startDate": "2025-02-26",
        "endDate": "Present",
        "weights": {
            "$CASH$": "2.25",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "1.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "0.00",
            "SU.TO": "3.00",
            "CVE.TO": "2.75",
            "CP.TO": "1.65",
            "WCN.TO": "0.00",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "6.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p5",
        "startDate": "2025-02-28",
        "endDate": "Present",
        "weights": {
            "$CASH$": "2.25",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "1.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "0.00",
            "SU.TO": "3.00",
            "CVE.TO": "2.75",
            "CP.TO": "1.65",
            "WCN.TO": "0.00",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "6.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p6",
        "startDate": "2025-03-31",
        "endDate": "Present",
        "weights": {
            "$CASH$": "2.25",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "1.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "0.00",
            "SU.TO": "3.00",
            "CVE.TO": "2.75",
            "CP.TO": "1.65",
            "WCN.TO": "0.00",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "6.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p7",
        "startDate": "2025-04-30",
        "endDate": "Present",
        "weights": {
            "$CASH$": "2.25",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "1.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "0.00",
            "SU.TO": "3.00",
            "CVE.TO": "2.75",
            "CP.TO": "1.65",
            "WCN.TO": "0.00",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "6.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p8",
        "startDate": "2025-05-31",
        "endDate": "Present",
        "weights": {
            "$CASH$": "2.25",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "1.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "0.00",
            "SU.TO": "3.00",
            "CVE.TO": "2.75",
            "CP.TO": "1.65",
            "WCN.TO": "0.00",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "6.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p9",
        "startDate": "2025-06-25",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "6.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p10",
        "startDate": "2025-06-30",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "6.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p11",
        "startDate": "2025-07-31",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "9.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "6.00",
            "TECH-B.TO": "0.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p12",
        "startDate": "2025-08-27",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "3.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p13",
        "startDate": "2025-08-31",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "3.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "0.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p14",
        "startDate": "2025-09-03",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "1.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "2.20",
            "RY.TO": "2.00",
            "TD.TO": "3.50",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "2.00",
            "CM.TO": "0.00",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p15",
        "startDate": "2025-09-10",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "1.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "2.00",
            "CM.TO": "2.55",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p16",
        "startDate": "2025-09-30",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "1.20",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.00",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "2.00",
            "CM.TO": "2.55",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p17",
        "startDate": "2025-10-15",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "10.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "0.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p18",
        "startDate": "2025-10-27",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "8.50",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "1.50",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p19",
        "startDate": "2025-10-31",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50%",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "8.50",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "2.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "1.50",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p20",
        "startDate": "2025-11-17",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "6.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "3.00",
            "CRWD": "2.00",
            "MSFT": "2.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "3.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p21",
        "startDate": "2025-11-25",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "5.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "1.96",
            "BA": "1.50",
            "GOOGL": "3.00",
            "CRWD": "2.00",
            "MSFT": "3.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "3.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "3.00",
            "PANW": "0.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p22",
        "startDate": "2025-11-26",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "5.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "2.96",
            "BA": "1.50",
            "GOOGL": "3.00",
            "CRWD": "2.00",
            "MSFT": "3.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "0.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "3.00",
            "PANW": "2.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p23",
        "startDate": "2025-11-30",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "5.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "2.96",
            "BA": "1.50",
            "GOOGL": "3.00",
            "CRWD": "2.00",
            "MSFT": "3.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "2.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "1.65",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "0.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "3.00",
            "PANW": "2.00",
            "COST": "0.00",
            "CPX.TO": "0.00"
        }
    },
    {
        "id": "p24",
        "startDate": "2025-12-04",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "2.65",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "2.96",
            "BA": "1.50",
            "GOOGL": "3.00",
            "CRWD": "2.00",
            "MSFT": "3.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "0.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "2.00",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "9.00",
            "TECH-B.TO": "0.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "3.00",
            "PANW": "2.00",
            "COST": "2.00",
            "CPX.TO": "2.00"
        }
    },
    {
        "id": "p25",
        "startDate": "2025-12-17",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "0.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "2.96",
            "BA": "1.50",
            "GOOGL": "3.00",
            "CRWD": "2.00",
            "MSFT": "3.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "0.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "2.00",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "11.65",
            "TECH-B.TO": "0.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "3.00",
            "PANW": "2.00",
            "COST": "2.00",
            "CPX.TO": "2.00"
        }
    },
    {
        "id": "p26",
        "startDate": "2025-12-31",
        "endDate": "Present",
        "weights": {
            "$CASH$": "0.50",
            "MKB.TO": "0.00",
            "BIP791": "12.50",
            "DJT03868": "12.50",
            "BILLET US BANK": "2.34",
            "TDB3173": "0.00",
            "DYN245": "6.50",
            "MFC8625": "0.00",
            "BRK-B": "2.96",
            "BA": "1.50",
            "GOOGL": "3.00",
            "CRWD": "2.00",
            "MSFT": "3.00",
            "UNH": "2.60",
            "FNV.TO": "2.00",
            "CTC-A.TO": "0.00",
            "BNS.TO": "0.00",
            "RY.TO": "2.60",
            "TD.TO": "2.55",
            "T.TO": "0.00",
            "CCO.TO": "1.50",
            "ENB.TO": "1.75",
            "SU.TO": "3.00",
            "CVE.TO": "0.00",
            "CP.TO": "1.65",
            "WCN.TO": "1.75",
            "AFN.TO": "1.50",
            "WSP.TO": "2.00",
            "MRU.TO": "1.50",
            "ATD.TO": "3.00",
            "XUS.TO": "11.65",
            "TECH-B.TO": "0.00",
            "CRM": "2.60",
            "CM.TO": "2.55",
            "AMZN": "3.00",
            "PANW": "2.00",
            "COST": "2.00",
            "CPX.TO": "2.00"
        }
    }
];

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ isOpen, onClose, onSubmit, existingData }) => {
    const [tickers, setTickers] = useState<TickerRow[]>(DEFAULT_TICKERS);

    const [periods, setPeriods] = useState<AllocationPeriod[]>(DEFAULT_PERIODS);

    const [newTickerInput, setNewTickerInput] = useState('');

    // Reset or load data when modal opens
    useEffect(() => {
        if (isOpen && existingData && existingData.length > 0) {
            // Logic to parse existing items into the grid format could go here
            // For now, we start fresh or keep state if simpler
        }
    }, [isOpen, existingData]);

    const handleAddTicker = () => {
        if (!newTickerInput.trim()) return;
        const tickerUpper = newTickerInput.toUpperCase().trim();
        if (tickers.find(t => t.ticker === tickerUpper)) return; // No duplicates

        setTickers([...tickers, { ticker: tickerUpper }]);
        setNewTickerInput('');

        // Initialize weights for new ticker to 0 in all periods
        const newPeriods = periods.map(p => ({
            ...p,
            weights: { ...p.weights, [tickerUpper]: '0.00' }
        }));
        setPeriods(newPeriods);
    };

    const handleRemoveTicker = (tickerToRemove: string) => {
        setTickers(tickers.filter(t => t.ticker !== tickerToRemove));
        // Check if we need to clean up weights? Not strictly necessary but cleaner
    };

    const handleWeightChange = (periodId: string, ticker: string, val: string) => {
        // Allow dots and numbers
        if (!/^\d*\.?\d*$/.test(val)) return;

        const newPeriods = periods.map(p => {
            if (p.id !== periodId) return p;
            return {
                ...p,
                weights: {
                    ...p.weights,
                    [ticker]: val
                }
            };
        });
        setPeriods(newPeriods);
    };

    const handleWeightBlur = (periodId: string, ticker: string, val: string) => {
        const num = parseFloat(val);
        const formatted = isNaN(num) ? '0.00' : num.toFixed(2);

        const newPeriods = periods.map(p => {
            if (p.id !== periodId) return p;
            return {
                ...p,
                weights: { ...p.weights, [ticker]: formatted }
            };
        });
        setPeriods(newPeriods);
    };

    const handleAddPeriod = () => {
        const newId = (periods.length + 1).toString();
        // Default to today
        const today = new Date().toISOString().split('T')[0];

        // Inherit weights from last period if available
        let initialWeights: Record<string, string> = {};
        if (periods.length > 0) {
            initialWeights = { ...periods[periods.length - 1].weights };
        } else {
            tickers.forEach(t => initialWeights[t.ticker] = '0.00');
        }

        setPeriods([...periods, {
            id: newId,
            startDate: today,
            endDate: 'Present',
            weights: initialWeights
        }]);
    };

    const handleRemovePeriod = (id: string) => {
        if (periods.length <= 1) return; // Keep at least one
        setPeriods(periods.filter(p => p.id !== id));
    };

    const handleDateChange = (id: string, field: 'startDate' | 'endDate', val: string) => {
        setPeriods(periods.map(p => {
            if (p.id !== id) return p;
            return { ...p, [field]: val };
        }));
    };

    const calculateTotal = (period: AllocationPeriod) => {
        let total = 0;
        tickers.forEach(t => {
            total += parseFloat(period.weights[t.ticker] || '0');
        });
        return total;
    };

    const handleSubmit = () => {
        // Convert the grid state into a flat list of items per the backend requirement
        // Logic: 
        // Backend expects specific dates.
        // We have "Periods" (Start -> End).
        // The backend in 'main.py' iterates through dates provided in the upload.
        // To mimic this, we should generate PortfolioItems.
        // 
        // IF the user defines multiple periods, we need to send "snapshots" of rebalancing.
        // The simplest way to integrate with the current system is to send a "rebalance" entry
        // for every Start Date defined.

        const flatItems: PortfolioItem[] = [];

        periods.forEach(period => {
            tickers.forEach(t => {
                const weight = parseFloat(period.weights[t.ticker] || '0');
                if (weight > 0) {
                    flatItems.push({
                        ticker: t.ticker,
                        weight: weight, // Send whole numbers (50.55), backend/UploadView handles it
                        date: period.startDate,
                        // No return/contribution data for manual entry initially
                    });
                }
            });
        });

        onSubmit(flatItems);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-[95vw] h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Portfolio Editor</h2>
                        <p className="text-slate-500 text-sm">Manually configure weights and rebalancing periods.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={24} className="text-slate-400" />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-auto p-6">
                    <div className="flex gap-8 min-w-max">

                        {/* Ticker Column */}
                        <div className="w-64 flex-shrink-0 pt-[120px]"> {/* Adjusted Padding to align with new taller headers */}
                            {tickers.map((t) => (
                                <div key={t.ticker} className="h-16 flex items-center justify-between group border-b border-gray-50 px-2">
                                    <div>
                                        <div className="font-bold text-slate-800">{t.ticker}</div>
                                        {t.name && <div className="text-xs text-slate-400 truncate w-48">{t.name}</div>}
                                    </div>
                                    <button
                                        onClick={() => handleRemoveTicker(t.ticker)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}

                            {/* Add Ticker Input */}
                            <div className="h-16 flex items-center mt-2 px-2">
                                <div className="flex items-center gap-2 w-full">
                                    <input
                                        type="text"
                                        value={newTickerInput}
                                        onChange={(e) => setNewTickerInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddTicker()}
                                        placeholder="+ Ticker"
                                        className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-bold text-slate-600 placeholder:font-normal"
                                    />
                                    {newTickerInput && (
                                        <button onClick={handleAddTicker} className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700">
                                            <Plus size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Allocation Periods */}
                        <div className="flex gap-4">
                            {periods.map((period, idx) => {
                                const total = calculateTotal(period);
                                const isTotalValid = Math.abs(total - 100) < 0.1;

                                // Determine display dates
                                const isLast = idx === periods.length - 1;
                                const nextStartDate = isLast ? 'Present' : periods[idx + 1].startDate;
                                const displayRange = `${period.startDate} - ${nextStartDate}`;

                                return (
                                    <div key={period.id} className="w-64 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col">
                                        {/* Header - Fixed Height 120px */}
                                        <div className="h-[120px] p-4 border-b border-gray-200 bg-slate-50 rounded-t-xl flex flex-col justify-between">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Period {idx + 1}</h4>
                                                {periods.length > 1 && (
                                                    <button onClick={() => handleRemovePeriod(period.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2 py-1.5 shadow-sm">
                                                    <Calendar size={12} className="text-slate-400 flex-shrink-0" />
                                                    <input
                                                        type="date"
                                                        value={period.startDate}
                                                        onChange={(e) => handleDateChange(period.id, 'startDate', e.target.value)}
                                                        className="w-full text-xs font-semibold text-slate-700 focus:outline-none bg-transparent"
                                                    />
                                                </div>
                                                <div className="text-[10px] text-center font-medium text-slate-400">
                                                    to {isLast ? <span className="text-slate-600 font-bold">Actual</span> : nextStartDate}
                                                </div>
                                            </div>

                                            <div className={`text-center py-1 rounded text-xs font-bold border ${isTotalValid ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                                Allocated: {total.toFixed(2)}%
                                            </div>
                                        </div>

                                        {/* Weights */}
                                        <div>
                                            {tickers.map(t => {
                                                const currentWeight = parseFloat(period.weights[t.ticker] || '0');
                                                const prevWeight = idx > 0 ? parseFloat(periods[idx - 1].weights[t.ticker] || '0') : currentWeight;

                                                let bgClass = "bg-slate-50 hover:bg-slate-100";
                                                let borderClass = "border-slate-200";

                                                if (idx > 0) {
                                                    if (currentWeight > prevWeight + 0.001) {
                                                        bgClass = "bg-green-50 hover:bg-green-100 text-green-800";
                                                        borderClass = "border-green-200";
                                                    } else if (currentWeight < prevWeight - 0.001) {
                                                        bgClass = "bg-red-50 hover:bg-red-100 text-red-800";
                                                        borderClass = "border-red-200";
                                                    }
                                                }

                                                return (
                                                    <div key={`${period.id}-${t.ticker}`} className="h-16 flex items-center justify-center border-b border-gray-50 last:border-0 p-2">
                                                        <div className="relative w-full">
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={period.weights[t.ticker] || ''}
                                                                onChange={(e) => handleWeightChange(period.id, t.ticker, e.target.value)}
                                                                onBlur={(e) => handleWeightBlur(period.id, t.ticker, e.target.value)}
                                                                className={`w-full text-right pr-6 pl-3 py-2 ${bgClass} border ${borderClass} rounded-lg font-mono font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors`}
                                                                placeholder="0.00"
                                                            />
                                                            <span className="absolute right-3 top-2.5 text-slate-400 text-xs font-bold">%</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* New Allocation Button */}
                            <div className="pt-4">
                                <button
                                    onClick={handleAddPeriod}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap"
                                >
                                    <Plus size={16} /> New Allocation
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 flex justify-between items-center bg-gray-50 rounded-b-xl">
                    <div className="text-sm text-slate-500">
                        <span className="font-bold text-slate-700">{tickers.length}</span> tickers across <span className="font-bold text-slate-700">{periods.length}</span> rebalancing periods.
                    </div>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-6 py-2.5 rounded-lg text-slate-600 font-semibold hover:bg-slate-200 transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-200 flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
                        >
                            <Save size={18} /> Analyze Portfolio
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
