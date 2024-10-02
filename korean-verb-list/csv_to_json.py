import csv
import json

def csv_to_json(csv_file_path, json_file_path):
    # Open the CSV file
    with open(csv_file_path, mode='r', encoding='utf-8') as csv_file:
        csv_reader = csv.reader(csv_file)

        # Create the data structure
        data = {
            "verbs": [
                {"hangeul": row[0], "eng": f"to {row[1].split(',')[0].strip()}"}
                for row in csv_reader
            ]
        }

    # Write the JSON data to a file
    with open(json_file_path, mode='w', encoding='utf-8') as json_file:
        json.dump(data, json_file, ensure_ascii=False, indent=2)

    print(f"JSON data has been written to {json_file_path}")

# Example usage:
csv_file_path = 'verbs.csv'  # Your input CSV file
json_file_path = 'verbs.json'  # Desired output JSON file

csv_to_json(csv_file_path, json_file_path)
