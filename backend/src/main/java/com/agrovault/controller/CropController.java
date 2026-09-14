package com.agrovault.controller;

import com.agrovault.model.Crop;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@RestController
@CrossOrigin
@RequestMapping("/api/crops")
public class CropController {
    private final List<Crop> crops = new CopyOnWriteArrayList<>(List.of(
        new Crop("Broccoli", 120, "2026-09-02", "Vegetable", 10),
        new Crop("Carrot", 80, "2026-09-04", "Root crop", 18)
    ));
    @GetMapping public List<Crop> getCrops() { return crops; }
    @PostMapping public Crop addCrop(@Valid @RequestBody Crop crop) { crops.add(crop); return crop; }
}