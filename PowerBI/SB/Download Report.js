"use strict";

// ----------- CONFIGURATION ----------- //
var reportName = 'Demo Report';	// Report name from ServiceBridge
var daysCount = 365; 				// Initial days count to retrieve from report 
var daysToRefresh = 15;				// How many days data should be refreshed for next executions
var daysToFuture = 0;				// 0 - Today, 1 - Tomorrow, 2 - Day after tomorrow, etc.
var pageSize = 1000;				// Page size
var authorizationKey = 'Basic ENCODED KEY'
// ----------- CONFIGURATION ----------- //

var webPage = require('webpage');
var fs = require('fs');
var page = webPage.create();

page.customHeaders = {
	'Authorization': authorizationKey
};

var reportFileName = 'SB/' + reportName + '_Report.json';
var metadataFileName = 'SB/' + reportName + '_Metadata.json';
var lastRefreshFileName = 'SB/' + reportName + '_LastRefresh.txt';

var date = new Date();
date.setDate(date.getDate() + daysToFuture);
var needToAmendWorkerFile = false;
var needToAmendMainFile = false;
var mainFileSeparator = '';

function handlePage(i, dayIteration)
{	
	var retrievedRecords = i * pageSize;
	var dateStr = date.getFullYear() + '-' + ('0' + (date.getMonth()+1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2);
	var workfileName = 'SB/Temp/' + reportName + '_' + date.getFullYear() + '-' + ('0' + (date.getMonth()+1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2) + '.json';
	var url = 'https://cloud.servicebridge.com/api/v1/Report?name=' + reportName + '&dateFromFilter=' + dateStr + '&dateToFilter=' + dateStr + '&pagesize=' + pageSize + '&page=' + i;
	
	console.log('dayIteration: ' + dayIteration + '; page: ' + i);
	
	// Recreate file, because need to refresh data
	if (i == 1 && dayIteration <= daysToRefresh) {
		fs.write(workfileName, '', 'w');
		needToAmendWorkerFile = false;
	}

	// If old file exists - do not refresh the data
	if (i == 1 && dayIteration > daysToRefresh && fs.exists(workfileName)) {
		// Copy data from cached file
		var content = fs.read(workfileName);	
		
		if (content.length > 0) {
			if (needToAmendMainFile == true) {
				mainFileSeparator = ',';
			}
			fs.write(reportFileName, mainFileSeparator + content, 'a');
		}		
		
		if (dayIteration < daysCount) {
			// Move to the next date
			console.log('Skipping, file exists: ' + workfileName);
			date.setDate(date.getDate() - 1)
			dayIteration = dayIteration + 1;
			needToAmendWorkerFile = false;
			handlePage(1, dayIteration);
		}
		else {
			// Already iterated through all requested days
			finishDataRetrieval();
		}
	}
	else {
		console.log('Url: ' + url);
		page.open(url, function (status) 
		{
			console.log('Status: ' + status);
			if (status === 'success') {		
				var jsonSource = page.plainText;
				var result = JSON.parse(jsonSource);
				var moreItems = false;
				var workerFileSeparator = '';
			
				console.log('Total: ' + result.Data.Total);
				
				if (result.Data.Total > retrievedRecords) {
					moreItems = true;
				}
				
				// Save metadata from the first iteration
				if (i === 1 && dayIteration === 1) {
					var metadata = JSON.stringify(result.Data.Fields);
					fs.write(metadataFileName, metadata, 'a');	
				}
					
				var dataResult = JSON.stringify(result.Data.Data);
				dataResult = '|__^s' + dataResult;
				dataResult = dataResult.replace('|__^s[', '');
				dataResult = dataResult + '__^e|'
				dataResult = dataResult.replace(']__^e|', '');

				if (dataResult.length > 0 && needToAmendWorkerFile == true) {
					workerFileSeparator = ',';
				}						
				fs.write(workfileName, workerFileSeparator + dataResult, 'a');

				if (dataResult.length > 0) {
					if (needToAmendMainFile == true) {
						mainFileSeparator = ',';
					}
					fs.write(reportFileName, mainFileSeparator + dataResult, 'a');
				}

				// If we already have records, then next time we will need separator
				if (dataResult.length > 0)
				{
					needToAmendWorkerFile = true;
					needToAmendMainFile = true;
				}
				
				if (moreItems) {
					i = i + 1;
					handlePage(i, dayIteration);	
				}
				else if (dayIteration < daysCount){
					date.setDate(date.getDate() - 1)
					dayIteration = dayIteration + 1;
					needToAmendWorkerFile = false;
					handlePage(1, dayIteration);
				}
				else {
					finishDataRetrieval();
				}
			}
		});
	}
}

function finishDataRetrieval()
{
	fs.write(reportFileName, ']', 'a');
	fs.write(lastRefreshFileName, (new Date()).toUTCString(), 'w');
	
	var i = 0;
	
	while (i < 30)
	{
		date.setDate(date.getDate() - 1);
		var workfileName = 'SB/Temp/' + reportName + '_' + date.getFullYear() + '-' + ('0' + (date.getMonth()+1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2) + '.json';
	
		if (fs.exists(workfileName)) {
			fs.remove(workfileName);
		}
			
		i = i + 1;
	}
	
	phantom.exit();
}

fs.write(reportFileName, '', 'w');
fs.write(metadataFileName, '', 'w');
fs.write(reportFileName, '[', 'a');
handlePage(1, 1);

