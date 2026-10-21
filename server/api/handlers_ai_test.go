package api

import "testing"

func TestSpeakable(t *testing.T) {
	cases := map[string]string{
		"<think>plan the answer</think>It is **21°C** inside.": "It is 21 degrees inside.",
		"reasoning cut off </think> Lights are on.":            "Lights are on.",
		"Use `code`  here": "Use code here",
	}
	for in, want := range cases {
		if got := speakable(in); got != want {
			t.Errorf("speakable(%q) = %q, want %q", in, got, want)
		}
	}
}
