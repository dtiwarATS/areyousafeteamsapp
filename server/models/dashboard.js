const incList = {
    "type": "TextBlock",
    "text": "Incident List",
    "wrap": true,
    "style": "heading",
    "size": "Large",
    "weight": "Bolder"
}

const getIncidentTileDashboard = (incData, dashboardData) => {
    if(incData != null && incData.length > 0){
        let eventIndex = 0;
        if(dashboardData != null && dashboardData.eventIndex != null && dashboardData.eventIndex > 0){
            if(dashboardData.eventIndex > 0){
                eventIndex = dashboardData.eventIndex;
            }    
            
            if(incData.length == eventIndex){
                eventIndex -= 2;
            }
        }

        if(incData.length < eventIndex){
            let eventCount = 1;
            let eventNum = 1;
            if(eventIndex > 1){
              eventNum = Number(eventIndex) + 1;
            }
            
        }
    }    
}