package com.agrovault.model;

public record SensorData(double temperature, double humidity, String temperatureStatus, String humidityStatus) {}