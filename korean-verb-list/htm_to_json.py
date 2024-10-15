from bs4 import BeautifulSoup
import json

# Read your HTML file
with open('6000_korean_words.htm', 'r', encoding='utf-8') as file:
    html_content = file.read()

# Parse the HTML
soup = BeautifulSoup(html_content, 'html.parser')

# Extract the text inside <pre> tags (this is where the data is)
pre_tag = soup.find('pre')
lines = pre_tag.text.strip().split('\n')

# Initialize dictionaries to hold verbs for each level
verbs_A = []
verbs_B = []
verbs_C = []

# Loop through each line of the extracted data
for line in lines:
    columns = line.split()  # Split the line by whitespace

    # Ensure we have enough columns to process
    if len(columns) > 4:
        level = columns[1]  # Level column (A, B, or C)
        pos = columns[2]    # Part of speech column

        # Check if the part of speech (POS) is verb (assuming '2' denotes a verb)
        if pos == '2':
            verb_entry = {
                "hangeul": columns[3],  # The Korean word
                "eng": " ".join(columns[4:])  # The English translation (joining remaining words)
            }

            # Add the entry to the corresponding level
            if level == 'A':
                verbs_A.append(verb_entry)
            elif level == 'B':
                verbs_B.append(verb_entry)
            elif level == 'C':
                verbs_C.append(verb_entry)

# Prepare the final dictionary structures for each level
data_A = {"verbs": verbs_A}
data_B = {"verbs": verbs_B}
data_C = {"verbs": verbs_C}

# Write to separate JSON files
with open('korean_verbs_A.json', 'w', encoding='utf-8') as json_file_A:
    json.dump(data_A, json_file_A, ensure_ascii=False, indent=4)

with open('korean_verbs_B.json', 'w', encoding='utf-8') as json_file_B:
    json.dump(data_B, json_file_B, ensure_ascii=False, indent=4)

with open('korean_verbs_C.json', 'w', encoding='utf-8') as json_file_C:
    json.dump(data_C, json_file_C, ensure_ascii=False, indent=4)

print("Conversion complete! JSON files for levels A, B, and C have been saved.")
