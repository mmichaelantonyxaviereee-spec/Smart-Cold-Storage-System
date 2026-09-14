package com.agrovault.model;

public record EnergyData(double solar, int battery, int thermal, double consumption, boolean energyIndependent) {}