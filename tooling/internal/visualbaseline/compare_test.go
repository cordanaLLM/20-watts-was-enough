package visualbaseline

import (
	"image"
	"image/color"
	"testing"
)

func solid(width, height int) *image.NRGBA {
	value := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			value.SetNRGBA(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	return value
}

func TestComparisonBoundaries(t *testing.T) {
	baseline := solid(8, 8)
	for _, test := range []struct{ delta, want int }{{0, 0}, {2, 0}, {3, 1}} {
		actual := solid(8, 8)
		actual.SetNRGBA(2, 3, color.NRGBA{R: uint8(255 - test.delta), G: 255, B: 255, A: 255})
		got := Compare(baseline, actual, 2)
		if got.DifferingPixels != test.want || got.MaxChannelDelta != test.delta || !got.DimensionsMatch {
			t.Fatalf("delta %d: %+v", test.delta, got)
		}
	}
	for _, count := range []int{16, 17} {
		actual := solid(8, 8)
		for index := 0; index < count; index++ {
			actual.SetNRGBA(index%8, index/8, color.NRGBA{A: 255})
		}
		got := Compare(baseline, actual, 2)
		if got.DifferingPixels != count || got.Pass(16) != (count == 16) {
			t.Fatalf("pixel boundary %d: %+v", count, got)
		}
	}
	got := Compare(baseline, solid(9, 8), 2)
	if got.DimensionsMatch || got.Pass(16) {
		t.Fatalf("dimension mismatch passed: %+v", got)
	}
}

func TestStraightRGBAAndDifferentImageOrigins(t *testing.T) {
	baseline := image.NewNRGBA(image.Rect(5, 6, 6, 7))
	actual := image.NewNRGBA(image.Rect(0, 0, 1, 1))
	baseline.SetNRGBA(5, 6, color.NRGBA{R: 150, A: 128})
	actual.SetNRGBA(0, 0, color.NRGBA{R: 150, A: 131})
	got := Compare(baseline, actual, 2)
	if got.DifferingPixels != 1 || got.MaxChannelDelta != 3 || !got.DimensionsMatch {
		t.Fatal(got)
	}
}

func TestPlantedMarkerRemovalFails(t *testing.T) {
	baseline, actual := solid(64, 100), solid(64, 100)
	for marker := 0; marker < 5; marker++ {
		for dy := -3; dy <= 3; dy++ {
			for dx := -3; dx <= 3; dx++ {
				if dx*dx+dy*dy <= 9 {
					baseline.SetNRGBA(8+dx, 10+marker*18+dy, color.NRGBA{R: 39, G: 103, B: 71, A: 255})
				}
			}
		}
	}
	got := Compare(baseline, actual, 2)
	if got.Pass(16) || got.DifferingPixels <= 16 || got.MaxChannelDelta < 100 {
		t.Fatalf("removed markers accepted: %+v", got)
	}
	diff := Diff(baseline, actual, 2)
	if diff.At(8, 10) != (color.NRGBA{R: 255, A: 255}) {
		t.Fatal("marker difference is not red")
	}
	if diff.At(40, 40) != (color.NRGBA{R: 85, G: 85, B: 85, A: 255}) {
		t.Fatal("actual background is not dimmed")
	}
}
