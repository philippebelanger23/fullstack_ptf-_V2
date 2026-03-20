import { useState, useEffect } from 'react';
import { PortfolioItem } from '../../types';
import { loadPortfolioConfig, savePortfolioConfig, convertConfigToItems } from '../../services/api';

export interface AllocationPeriod {
    id: string;
    startDate: string;
    endDate: string | 'Present';
    weights: Record<string, string>; // ticker -> weight (string for inputs)
}

export interface TickerRow {
    ticker: string;
    name?: string; // Optional company name
    isMutualFund?: boolean; // Flag for mutual funds that require CSV NAV data
    isEtf?: boolean; // Flag for ETFs
}

export const DEFAULT_TICKERS: TickerRow[] = [
    {
        "ticker": "*cash*"
    },
    {
        "ticker": "MKB.TO"
    },
    {
        "ticker": "BIP791",
        "isMutualFund": true
    },
    {
        "ticker": "DJT03868",
        "isMutualFund": true
    },
    {
        "ticker": "BILLET US BANK"
    },
    {
        "ticker": "TDB3173",
        "isMutualFund": true
    },
    {
        "ticker": "DYN245",
        "isMutualFund": true
    },
    {
        "ticker": "MFC8625",
        "isMutualFund": true
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

export const DEFAULT_PERIODS: AllocationPeriod[] = [
    {
        "id": "p1",
        "startDate": "2024-12-31",
        "endDate": "Present",
        "weights": {
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "2.25",
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
            "*cash*": "2.25",
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
            "*cash*": "2.25",
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
            "*cash*": "2.25",
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
            "*cash*": "2.25",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50%",
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
            "*cash*": "0.50",
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
            "*cash*": "0.50",
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
            "*cash*": "0.50",
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
            "*cash*": "0.50",
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
            "*cash*": "0.50",
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
            "*cash*": "0.50",
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
            "*cash*": "0.50",
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

export interface UseManualEntryStateReturn {
    tickers: TickerRow[];
    setTickers: React.Dispatch<React.SetStateAction<TickerRow[]>>;
    periods: AllocationPeriod[];
    setPeriods: React.Dispatch<React.SetStateAction<AllocationPeriod[]>>;
    isInitialLoading: boolean;
    isSaving: boolean;
    savedSuccess: boolean;
    newTickerInput: string;
    setNewTickerInput: React.Dispatch<React.SetStateAction<string>>;
    filteredPeriods: AllocationPeriod[];
    sortedTickers: TickerRow[];
    displayTickers: TickerRow[];
    handleAddTicker: () => void;
    handleRemoveTicker: (ticker: string) => void;
    handleToggleMutualFund: (ticker: string) => void;
    handleToggleEtf: (ticker: string) => void;
    handleWeightChange: (periodId: string, ticker: string, val: string) => void;
    handleWeightBlur: (periodId: string, ticker: string, val: string) => void;
    handleAddPeriod: () => void;
    handleRemovePeriod: (id: string) => void;
    handleDateChange: (id: string, field: 'startDate' | 'endDate', val: string) => void;
    calculateTotal: (period: AllocationPeriod) => number;
    handleSubmit: () => Promise<void>;
}

export function useManualEntryState(
    isOpen: boolean,
    existingData: PortfolioItem[] | undefined,
    selectedYear: 2025 | 2026,
    onSubmit: (data: PortfolioItem[]) => void,
    onClose: () => void
): UseManualEntryStateReturn {
    const [tickers, setTickers] = useState<TickerRow[]>(DEFAULT_TICKERS);
    const [periods, setPeriods] = useState<AllocationPeriod[]>(DEFAULT_PERIODS);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [savedSuccess, setSavedSuccess] = useState(false);
    const [newTickerInput, setNewTickerInput] = useState('');

    // Load saved configuration or fall back to defaults
    useEffect(() => {
        const fetchConfig = async () => {
            setIsInitialLoading(true);
            try {
                const config = await loadPortfolioConfig();
                if (config.tickers && config.tickers.length > 0) {
                    setTickers(config.tickers);
                }
                if (config.periods && config.periods.length > 0) {
                    const formattedPeriods = config.periods.map((p: any) => ({
                        ...p,
                        weights: Object.fromEntries(
                            Object.entries(p.weights || {}).map(([ticker, val]) => {
                                const num = parseFloat(val as string);
                                return [ticker, isNaN(num) ? '0.00' : num.toFixed(2)];
                            })
                        )
                    }));
                    setPeriods(formattedPeriods);
                }
            } catch (err) {
                console.error("Failed to load portfolio config:", err);
            } finally {
                setIsInitialLoading(false);
            }
        };

        if (isOpen) {
            setIsSaving(false);
            setSavedSuccess(false);
            fetchConfig();
        }
    }, [isOpen]);

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

    const handleToggleMutualFund = (ticker: string) => {
        setTickers(tickers.map(t =>
            t.ticker === ticker
                ? { ...t, isMutualFund: !t.isMutualFund }
                : t
        ));
    };

    const handleToggleEtf = (ticker: string) => {
        setTickers(tickers.map(t =>
            t.ticker === ticker
                ? { ...t, isEtf: !t.isEtf }
                : t
        ));
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

    const handleSubmit = async () => {
        setIsSaving(true);
        const flatItems = convertConfigToItems(tickers, periods);

        try {
            // Persist the configuration to the server
            await savePortfolioConfig({ tickers, periods });
            setSavedSuccess(true);

            // Wait a moment for the user to see the success message
            setTimeout(() => {
                onSubmit(flatItems);
                onClose();
            }, 1500);
        } catch (err) {
            console.error("Failed to save portfolio config on submit:", err);
            // Even if save fails, we might want to proceed or show error
            // For now, let's proceed but maybe log it?
            // Or should we block? The user wants to analyze.
            // Let's assume we proceed after a short delay so they don't get stuck.
            setIsSaving(false);
            onSubmit(flatItems);
            onClose();
        }
    };

    const filteredPeriods = periods.filter(p => {
        if (selectedYear === 2025) {
            return p.startDate >= '2024-12-31' && p.startDate <= '2025-12-31';
        } else {
            return p.startDate >= '2025-12-31' && p.startDate <= '2026-12-31';
        }
    });

    // Sort tickers so those with 0% in the most recent period appear at the bottom
    const sortedTickers = [...tickers].sort((a, b) => {
        const mostRecentPeriod = filteredPeriods[filteredPeriods.length - 1];
        if (!mostRecentPeriod) return 0;

        const weightA = parseFloat(mostRecentPeriod.weights[a.ticker] || '0');
        const weightB = parseFloat(mostRecentPeriod.weights[b.ticker] || '0');

        // Push 0% positions to the bottom
        if (weightA === 0 && weightB !== 0) return 1;
        if (weightA !== 0 && weightB === 0) return -1;
        return 0; // Keep original order for same category
    });

    const displayTickers = sortedTickers.filter(t => {
        // Check if ANY period (across ALL periods, not just filtered) has non-zero weight
        const hasAnyWeight = periods.some(p => {
            const weight = parseFloat(p.weights[t.ticker] || '0');
            return weight !== 0;
        });

        // If ticker has weight in any period, check if it has weight in filtered periods
        if (hasAnyWeight) {
            return filteredPeriods.some(p => {
                const weight = parseFloat(p.weights[t.ticker] || '0');
                return weight !== 0;
            });
        }

        // If ticker has NO weight in ANY period, it's newly added - always show it
        return true;
    });

    return {
        tickers,
        setTickers,
        periods,
        setPeriods,
        isInitialLoading,
        isSaving,
        savedSuccess,
        newTickerInput,
        setNewTickerInput,
        filteredPeriods,
        sortedTickers,
        displayTickers,
        handleAddTicker,
        handleRemoveTicker,
        handleToggleMutualFund,
        handleToggleEtf,
        handleWeightChange,
        handleWeightBlur,
        handleAddPeriod,
        handleRemovePeriod,
        handleDateChange,
        calculateTotal,
        handleSubmit,
    };
}
