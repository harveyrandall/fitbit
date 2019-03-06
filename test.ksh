#!/bin/ksh

#curl schemas
curl -X PUT -H "Content-Type: application/json" --data-binary @schema.json http://localhost:8888/streams/demo/fitbit/steps
curl -X PUT -H "Content-Type: application/json" --data-binary @schema_heartrate.json http://localhost:8888/streams/demo/fitbit/heartrate
curl -X PUT -H "Content-Type: application/json" --data-binary @schema_sleep.json http://localhost:8888/streams/demo/fitbit/sleep
curl -X PUT -H "Content-Type: application/json" --data-binary @schema_profile.json http://localhost:8888/streams/demo/fitbit/profile

#Curl repositories
curl -X PUT -H "Content-Type: application/json" --data-binary @repo_mapping.json http://localhost:8888/streams/demo/fitbit/steps/repository
curl -X PUT -H "Content-Type: application/json" --data-binary @repo_mapping.json http://localhost:8888/streams/demo/fitbit/heartrate/repository
curl -X PUT -H "Content-Type: application/json" --data-binary @repo_mapping.json http://localhost:8888/streams/demo/fitbit/sleep/repository
curl -X PUT -H "Content-Type: application/json" --data-binary @repo_mapping.json http://localhost:8888/streams/demo/fitbit/profile/repository


if [ $? -eq "0" ]; then
	echo "All schema loaded"
else
	echo "Problem with loading schemas. Please check"
fi
