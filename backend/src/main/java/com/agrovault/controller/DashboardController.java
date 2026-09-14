package com.agrovault.controller;

import com.agrovault.model.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@CrossOrigin
@RequestMapping("/api")
public class DashboardController {
    private final java.util.List<Crop> crops = new java.util.concurrent.CopyOnWriteArrayList<>(java.util.List.of(
        new Crop("Broccoli", 120, "2026-09-02", "Vegetable", 10),
        new Crop("Carrot", 80, "2026-09-04", "Root crop", 18)
    ));
    @GetMapping("/energy") public EnergyData energy() { return new EnergyData(2.8, 86, 72, 1.9, true); }
    @GetMapping("/alerts") public java.util.List<Alert> alerts() { return java.util.List.of(new Alert("success", "Temperature stable", "Storage temperature is within the safe range."), new Alert("warning", "Crop approaching expiry", "Broccoli should be sold within 5 days.")); }
    @GetMapping("/dashboard") public Map<String, Object> dashboard() { return Map.of("sensors", new SensorData(4.2, 78, "Normal", "Normal"), "energy", energy(), "crops", crops); }
}