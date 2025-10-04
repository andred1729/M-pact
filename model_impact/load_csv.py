#!/usr/bin/env python3
"""
Script to load and convert the NASA Sentry CSV data to pandas DataFrame
"""

import pandas as pd
import numpy as np

def load_sentry_data(csv_file="cneos_sentry_summary_data.csv"):
    """
    Load the NASA Sentry CSV data into a pandas DataFrame
    
    Args:
        csv_file (str): Path to the CSV file
        
    Returns:
        pd.DataFrame: Loaded and processed DataFrame
    """
    try:
        # Load the CSV file
        print(f"Loading CSV file: {csv_file}")
        df = pd.read_csv(csv_file)
        
        print(f"Successfully loaded data!")
        print(f"DataFrame shape: {df.shape}")
        print(f"Columns: {list(df.columns)}")
        
        # Display basic info about the data
        print("\n" + "="*50)
        print("DATA OVERVIEW")
        print("="*50)
        print(f"Number of rows: {len(df)}")
        print(f"Number of columns: {len(df.columns)}")
        
        # Show data types
        print("\nData Types:")
        print(df.dtypes)
        
        # Show first few rows
        print("\nFirst 5 rows:")
        print(df.head())
        
        # Show basic statistics for numeric columns
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) > 0:
            print(f"\nBasic statistics for numeric columns:")
            print(df[numeric_cols].describe())
        
        return df
        
    except FileNotFoundError:
        print(f"Error: File '{csv_file}' not found!")
        return None
    except Exception as e:
        print(f"Error loading CSV: {str(e)}")
        return None

def analyze_data(df):
    """
    Perform basic analysis on the loaded DataFrame
    
    Args:
        df (pd.DataFrame): The loaded DataFrame
    """
    if df is None:
        return
    
    print("\n" + "="*50)
    print("DATA ANALYSIS")
    print("="*50)
    
    # Check for missing values
    missing_values = df.isnull().sum()
    if missing_values.sum() > 0:
        print("Missing values per column:")
        print(missing_values[missing_values > 0])
    else:
        print("No missing values found!")
    
    # Show unique values for categorical columns
    categorical_cols = df.select_dtypes(include=['object']).columns
    for col in categorical_cols[:5]:  # Show first 5 categorical columns
        unique_count = df[col].nunique()
        print(f"\nColumn '{col}': {unique_count} unique values")
        if unique_count <= 10:  # Show values if not too many
            print(f"Values: {df[col].unique()}")

if __name__ == "__main__":
    # Load the data
    df = load_sentry_data()
    
    # Analyze the data
    analyze_data(df)
    
    # Save as a variable for further use
    if df is not None:
        print(f"\nDataFrame 'df' is ready for use!")
        print(f"Access it with: df.head(), df.info(), df.describe(), etc.")
