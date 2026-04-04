"""
Portfolio Returns and Contribution Analysis
Generates professional Excel report for portfolio performance and attribution analysis.
"""

from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox

from cache_manager import load_cache, save_cache
from data_loader import load_input_data
from excel_formatter import create_excel_report
from period_utils import normalize_date
from report_engine import build_report_payload, print_mf_audit_trace


def main(weights_file, nav_file=None, output_dir=None):
    """Main function to generate portfolio returns report."""
    if output_dir is None:
        output_dir = Path("C:/Users/Phili/Downloads")
    else:
        output_dir = Path(output_dir)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cache = load_cache()
    
    print("Loading weights file...")
    input_data = load_input_data(weights_file, nav_file)

    print("Running chronological computation pipeline...")
    report_payload = build_report_payload(input_data, cache)
    
    holdings_name = Path(weights_file).stem
    report_end_date = normalize_date(report_payload.timeline.expanded_dates[-1])
    formatted_date = report_end_date.strftime("%d %b %Y")
    output_path = output_dir / f"Returns Contribution - {holdings_name} - {formatted_date}.xlsx"

    save_cache(cache)
    
    print("Building results dataframe...")
    print("Creating Excel report...")
    create_excel_report(report_payload, output_path)

    dyn245_trace = report_payload.mf_audit_traces.get("DYN245")
    if dyn245_trace is not None:
        print_mf_audit_trace("DYN245", dyn245_trace)
    
    print("Done!")


def select_files():
    """Open file picker dialogs to select weights and NAV files."""
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    
    print("Please select the Portfolio Weights file...")
    weights_file = filedialog.askopenfilename(
        title="Select Portfolio Weights File",
        initialdir="G:/My Drive/Google_GitHub/Return_Contribution_Files",
        filetypes=[("Excel files", "*.xlsx *.xls"), ("All files", "*.*")]
    )
    
    if not weights_file:
        print("No weights file selected. Exiting.")
        root.destroy()
        return None, None, None
    
    print(f"Weights file selected: {weights_file}")
    
    print("\nPlease select the Mutual Fund NAV file (optional - click Cancel to skip)...")
    nav_file = filedialog.askopenfilename(
        title="Select Mutual Fund NAV File (Optional)",
        initialdir="G:/My Drive/Google_GitHub/Return_Contribution_Files",
        filetypes=[("Excel files", "*.xlsx *.xls"), ("All files", "*.*")]
    )
    
    if nav_file:
        print(f"NAV file selected: {nav_file}")
    else:
        print("No NAV file selected. Continuing without NAV file.")
        nav_file = None
    
    print("\nOutput will be saved to Downloads folder.")
    output_dir = None
    
    root.destroy()
    return weights_file, nav_file, output_dir


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        weights_file = sys.argv[1]
        nav_file = sys.argv[2] if len(sys.argv) > 2 else None
        output_dir = sys.argv[3] if len(sys.argv) > 3 else None
        main(weights_file, nav_file, output_dir)
    else:
        weights_file, nav_file, output_dir = select_files()
        if weights_file:
            try:
                main(weights_file, nav_file, output_dir)
            except Exception as e:
                error_msg = f"Error generating report:\n{str(e)}"
                print(f"\nERROR: {error_msg}")
                messagebox.showerror("Error", error_msg)
