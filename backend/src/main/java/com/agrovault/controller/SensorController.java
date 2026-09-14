package com.agrovault.controller;

import com.agrovault.model.SensorData;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin
@RequestMapping("/api/sensors")
public class SensorController {
    @GetMapping
    public SensorData getSensors() { return new SensorData(4.2, 78, "Normal", "Normal"); }
}