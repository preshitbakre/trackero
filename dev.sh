#!/bin/bash

trap 'kill 0' EXIT

echo "Starting Trackero development servers..."

cd backend && npm run start:dev &
cd frontend && npm run dev &

wait
