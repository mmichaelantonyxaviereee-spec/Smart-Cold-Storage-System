package com.agrovault.model;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record Crop(@NotBlank String name, @Min(1) int quantity, String storageDate, String type, @Min(1) int expectedShelfLife) {}