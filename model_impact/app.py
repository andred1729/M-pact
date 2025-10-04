# Load the data
import pandas as pd
df = pd.read_csv('cneos_sentry_summary_data.csv')

# Clean column names
df.columns = df.columns.str.strip()

# Access the data
print(df.head())
print(df.describe())
print(df.info())