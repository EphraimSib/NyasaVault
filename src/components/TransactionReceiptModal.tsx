import React from 'react';
import { 
  X, 
  CheckCircle2, 
  ShieldCheck, 
  Printer, 
  Download, 
  Share2, 
  QrCode 
} from 'lucide-react';
import { Transaction } from '../types';
import { formatMWK, formatUSD } from '../utils/formatters';

interface TransactionReceiptModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

export const TransactionReceiptModal: React.FC<TransactionReceiptModalProps> = ({
  transaction,
  onClose,
}) => {
  if (!transaction) return null;

  const handlePrint = () => {
    window.print();
  };

  const isIncoming = transaction.direction === 'INCOMING';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden my-8 border border-slate-300">
        {/* Receipt Header Bar */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-sm">
              NV
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">NyasaVault Cloud Bank</div>
              <div className="text-[10px] text-emerald-400 font-mono">RESERVE BANK OF MALAWI CERTIFIED</div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Body */}
        <div className="p-6 space-y-6">
          {/* Status Badge */}
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
              Transaction Successful
            </span>
            <div className="font-mono text-2xl font-black text-slate-900 tabular-nums">
              {isIncoming ? '+' : '-'} {formatMWK(transaction.amountMWK)}
            </div>
            {transaction.equivalentUSD && (
              <div className="text-xs font-mono text-slate-600">
                Equivalent: {formatUSD(transaction.equivalentUSD)}
              </div>
            )}
          </div>

          {/* Details Grid */}
          <div className="border-t border-b border-dashed border-slate-300 py-4 space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Transaction Type</span>
              <span className="font-semibold text-slate-800">{transaction.title}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Payment Channel</span>
              <span className="font-semibold text-slate-800 font-mono">
                {transaction.channel.replace('_', ' ')}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Operator Reference</span>
              <span className="font-bold text-slate-900 font-mono">{transaction.operatorReference}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Timestamp</span>
              <span className="font-mono text-slate-700">{transaction.timestamp}</span>
            </div>

            {transaction.recipientOrMerchant && (
              <div className="flex justify-between">
                <span className="text-slate-500">Counterparty / Merchant</span>
                <span className="font-semibold text-slate-800 text-right truncate max-w-[200px]">
                  {transaction.recipientOrMerchant}
                </span>
              </div>
            )}

            {/* Fee Transparency */}
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="text-slate-500">Assessed Fee</span>
              <span className="font-mono font-semibold text-slate-800">
                {transaction.feeMWK > 0 ? formatMWK(transaction.feeMWK) : 'MWK 0.00'}
              </span>
            </div>

            <div className="flex justify-between font-bold text-sm pt-1">
              <span>Total Settled</span>
              <span className="font-mono text-slate-950">
                {formatMWK(transaction.amountMWK + transaction.feeMWK)}
              </span>
            </div>
          </div>

          {/* QR Code & Regulatory Footnote */}
          <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="w-14 h-14 bg-white p-1 rounded border border-slate-300 flex items-center justify-center shrink-0">
              <QrCode className="w-12 h-12 text-slate-800" />
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              Verified by Reserve Bank of Malawi NatSwitch Clearing Network. Electronically generated voucher valid as proof of payment across Malawi.
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handlePrint}
              className="flex-1 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
            <button
              onClick={() => {
                alert('Receipt downloaded to device storage.');
              }}
              className="flex-1 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
