function selectAll(source) {
	const checkboxes = document
		.getElementById("options-form")
		.querySelectorAll(`[id^="${source.id}"]`)
	
	for (const checkbox of Array.from(checkboxes)) {
		if (checkbox !== source) {
			checkbox.checked = source.checked;
		}
	}
}

const presIndAll = document.getElementById('present-declarative')
presIndAll.addEventListener('click', () => selectAll(presIndAll));

const pastIndAll = document.getElementById('past-declarative')
pastIndAll.addEventListener('click', () => selectAll(pastIndAll));

const futureIndAll = document.getElementById('future-declarative')
futureIndAll.addEventListener('click', () => selectAll(futureIndAll));