#!/usr/bin/env python3
"""
Simple analysis script for NASA Sentry data (no plotting dependencies)
"""

import pandas as pd
import numpy as np

def load_and_clean_data(csv_file="cneos_sentry_summary_data.csv"):
    """
    Load and clean the NASA Sentry CSV data
    
    Returns:
        pd.DataFrame: Cleaned DataFrame
    """
    # Load the data
    df = pd.read_csv(csv_file)
    
    # Clean column names (remove extra spaces)
    df.columns = df.columns.str.strip()
    
    # Remove the unnamed column if it's empty or not useful
    if 'Unnamed: 10' in df.columns:
        df = df.drop('Unnamed: 10', axis=1)
    
    # Convert year range to separate start and end years
    if 'Year Range' in df.columns:
        df[['Year_Start', 'Year_End']] = df['Year Range'].str.split('-', expand=True)
        df['Year_Start'] = pd.to_numeric(df['Year_Start'], errors='coerce')
        df['Year_End'] = pd.to_numeric(df['Year_End'], errors='coerce')
    
    return df

def analyze_impact_probabilities(df):
    """
    Analyze impact probabilities and risk levels
    """
    print("IMPACT PROBABILITY ANALYSIS")
    print("="*50)
    
    # Objects with highest impact probability
    high_risk = df.nlargest(10, 'Impact Probability (cumulative)')
    print("Top 10 objects by impact probability:")
    print(high_risk[['Object Designation', 'Impact Probability (cumulative)', 'Year Range']].to_string())
    
    # Objects with Palermo Scale > 0 (significant risk)
    significant_risk = df[df['Palermo Scale (cum.)'] > 0]
    print(f"\nObjects with significant risk (Palermo Scale > 0): {len(significant_risk)}")
    
    return high_risk, significant_risk

def analyze_size_distribution(df):
    """
    Analyze the size distribution of objects
    """
    print("\nSIZE DISTRIBUTION ANALYSIS")
    print("="*50)
    
    # Size categories
    df['Size_Category'] = pd.cut(df['Estimated Diameter (km)'], 
                                bins=[0, 0.1, 1, 10, 100, 1000], 
                                labels=['Tiny (<0.1km)', 'Small (0.1-1km)', 'Medium (1-10km)', 
                                       'Large (10-100km)', 'Very Large (>100km)'])
    
    size_counts = df['Size_Category'].value_counts()
    print("Size distribution:")
    print(size_counts)
    
    return size_counts

def analyze_timeframe(df):
    """
    Analyze the timeframe of potential impacts
    """
    print("\nTIMEFRAME ANALYSIS")
    print("="*50)
    
    # Analyze year ranges
    if 'Year_Start' in df.columns:
        print(f"Earliest potential impact: {df['Year_Start'].min()}")
        print(f"Latest potential impact: {df['Year_End'].max()}")
        
        # Objects with impacts in next 100 years
        near_term = df[df['Year_Start'] <= 2124]
        print(f"Objects with potential impacts in next 100 years: {len(near_term)}")
    
    return df

def create_summary_report(df):
    """
    Create a comprehensive summary report
    """
    print("\n" + "="*60)
    print("NASA SENTRY DATA SUMMARY REPORT")
    print("="*60)
    
    print(f"Total objects tracked: {len(df)}")
    print(f"Total potential impacts: {df['Potential Impacts'].sum()}")
    print(f"Average impact probability: {df['Impact Probability (cumulative)'].mean():.2e}")
    print(f"Highest impact probability: {df['Impact Probability (cumulative)'].max():.2e}")
    
    # Risk assessment
    high_prob = df[df['Impact Probability (cumulative)'] > 1e-6]
    print(f"Objects with impact probability > 1e-6: {len(high_prob)}")
    
    # Size analysis
    large_objects = df[df['Estimated Diameter (km)'] > 1]
    print(f"Objects larger than 1km: {len(large_objects)}")
    
    print("\nTop 5 most concerning objects:")
    top_concern = df.nlargest(5, 'Impact Probability (cumulative)')
    for idx, row in top_concern.iterrows():
        print(f"- {row['Object Designation']}: P={row['Impact Probability (cumulative)']:.2e}, "
              f"Size={row['Estimated Diameter (km)']:.2f}km, Years={row['Year Range']}")

def main():
    """
    Main analysis function
    """
    print("Loading NASA Sentry data...")
    df = load_and_clean_data()
    
    print(f"Data loaded successfully! Shape: {df.shape}")
    print(f"Columns: {list(df.columns)}")
    
    # Perform various analyses
    high_risk, significant_risk = analyze_impact_probabilities(df)
    size_dist = analyze_size_distribution(df)
    df = analyze_timeframe(df)
    create_summary_report(df)
    
    return df

if __name__ == "__main__":
    # Run the analysis
    sentry_df = main()
    
    print(f"\nDataFrame 'sentry_df' is ready for further analysis!")
    print("You can now use it for plotting, filtering, or any other analysis.")
