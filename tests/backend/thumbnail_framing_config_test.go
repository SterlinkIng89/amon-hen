package backend_test

import (
	"encoding/json"
	"testing"

	"amon-hen/backend"
)

func TestThumbnailFramingConfig_JSONRoundTrip(t *testing.T) {
	// 1. TagThumbnailConfig with ImageFraming
	cfg := backend.TagThumbnailConfig{
		Enabled:         true,
		SourceType:      "steam",
		SteamAssetType:  "hero",
		EpisodePosition: "bottom-right",
		EpisodeFormat:   "pad2",
		FontColor:       "#ffffff",
		ImageFraming: &backend.ImageFraming{
			OffsetX: 0.25,
			OffsetY: 0.75,
			Zoom:    1.5,
		},
	}

	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("Failed to marshal config: %v", err)
	}

	var decoded backend.TagThumbnailConfig
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal config: %v", err)
	}

	if decoded.ImageFraming == nil {
		t.Fatalf("Expected ImageFraming to be decoded, got nil")
	}

	if decoded.ImageFraming.OffsetX != 0.25 || decoded.ImageFraming.OffsetY != 0.75 || decoded.ImageFraming.Zoom != 1.5 {
		t.Errorf("Unexpected framing values: %+v", decoded.ImageFraming)
	}

	// 2. Legacy config without ImageFraming
	legacyJSON := []byte(`{
		"enabled": true,
		"source_type": "steam",
		"episode_position": "bottom-right",
		"episode_format": "pad2"
	}`)

	var legacyDecoded backend.TagThumbnailConfig
	if err := json.Unmarshal(legacyJSON, &legacyDecoded); err != nil {
		t.Fatalf("Failed to unmarshal legacy config: %v", err)
	}

	if legacyDecoded.ImageFraming != nil {
		t.Errorf("Expected nil ImageFraming for legacy config, got: %+v", legacyDecoded.ImageFraming)
	}

	// Re-marshaling legacy should omit image_framing
	reMarshaled, err := json.Marshal(legacyDecoded)
	if err != nil {
		t.Fatalf("Failed to marshal legacy config: %v", err)
	}
	var rawMap map[string]interface{}
	_ = json.Unmarshal(reMarshaled, &rawMap)
	if _, exists := rawMap["image_framing"]; exists {
		t.Errorf("Expected image_framing to be omitted in legacy JSON, but found it in: %s", string(reMarshaled))
	}
}
