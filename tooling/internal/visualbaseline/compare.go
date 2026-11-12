package visualbaseline

import (
	"image"
	"image/color"
)

// Comparison counts pixels whose largest straight RGBA channel delta exceeds tolerance.
type Comparison struct {
	DifferingPixels int  `json:"differing_pixels"`
	MaxChannelDelta int  `json:"max_channel_delta"`
	DimensionsMatch bool `json:"dimensions_match"`
}

// Pass accepts the inclusive pixel budget; dimension changes always fail.
func (result Comparison) Pass(maximumDifferingPixels int) bool {
	return result.DimensionsMatch && result.DifferingPixels <= maximumDifferingPixels
}

// Compare scans at most the plan's 4096 x 4096 pixels for validated PNG inputs.
func Compare(baseline, actual image.Image, tolerance int) Comparison {
	result := Comparison{DimensionsMatch: baseline.Bounds().Size() == actual.Bounds().Size()}
	if !result.DimensionsMatch {
		return result
	}
	bounds := actual.Bounds()
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			delta := pixelDelta(baseline.At(baseline.Bounds().Min.X+x, baseline.Bounds().Min.Y+y), actual.At(bounds.Min.X+x, bounds.Min.Y+y))
			result.MaxChannelDelta = max(result.MaxChannelDelta, delta)
			if delta > tolerance {
				result.DifferingPixels++
			}
		}
	}
	return result
}

func pixelDelta(left, right color.Color) int {
	a := color.NRGBAModel.Convert(left).(color.NRGBA)
	b := color.NRGBAModel.Convert(right).(color.NRGBA)
	return max(channelDelta(a.R, b.R), channelDelta(a.G, b.G), channelDelta(a.B, b.B), channelDelta(a.A, b.A))
}

func channelDelta(left, right uint8) int {
	return max(int(left)-int(right), int(right)-int(left))
}

// Diff marks differing pixels red over a dimmed actual image.
func Diff(baseline, actual image.Image, tolerance int) image.Image {
	bounds := actual.Bounds()
	output := image.NewNRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	for y := 0; y < bounds.Dy(); y++ {
		for x := 0; x < bounds.Dx(); x++ {
			value := color.NRGBAModel.Convert(actual.At(bounds.Min.X+x, bounds.Min.Y+y)).(color.NRGBA)
			dimmed := color.NRGBA{R: value.R / 3, G: value.G / 3, B: value.B / 3, A: 255}
			point := image.Pt(baseline.Bounds().Min.X+x, baseline.Bounds().Min.Y+y)
			if !point.In(baseline.Bounds()) || pixelDelta(baseline.At(point.X, point.Y), value) > tolerance {
				dimmed = color.NRGBA{R: 255, A: 255}
			}
			output.SetNRGBA(x, y, dimmed)
		}
	}
	return output
}
