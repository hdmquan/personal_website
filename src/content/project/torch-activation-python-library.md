---
title: Torch Activation - Python library
url: torch-activation
description: Torch-activation, a collection of activation functions for PyTorch library
author: Alan Huynh
date: 2025-02-27T01:07:00.000Z
image: /assets/images/blog/untitled-design-3-.jpg
imageAlt: torch-activation
tags:
  - research
  - machine-learning
  - open-source
---
# Exploring Unconventional Activation Functions - Torch Activation Library

[GitHub](https://github.com/hdmquan/torch_activation) | [PYPI](https://pypi.org/project/torch-activation/) | [ReadTheDocs](https://torch-activation.readthedocs.io/en/latest/index.html)

## Introduction

Activation functions are one of the most essential components of deep learning, injecting non-linearity into neural networks and making complex learning possible. While mainstream functions like ReLU, Sigmoid, and Tanh are widely used, I wanted to take a step off the beaten path and explore some unconventional and lesser-known activation functions. My project focused on defining and implementing various activation functions that either aren’t natively available in PyTorch or haven’t been extensively studied.

## Motivation

Deep learning is always evolving, with researchers constantly on the lookout for ways to boost model performance, stability, and efficiency. While the go-to activation functions work well in most cases, newer or modified ones can sometimes offer benefits like faster convergence, better gradient behavior, or improved robustness.

During one of my earliest projects, I had to deploy an extremely lightweight CNN on an edge device at the edge of the stratosphere. That experience gave me the chance to experiment with different architectures and implementations, and I quickly realised just how much activation functions impact a model’s behaviour, especially when the model only have 300 parameters :D That curiosity stuck with me, and I decided to dive deeper into alternative activation functions to see what they had to offer.

## Implementation and Challenges

One of the biggest hurdles in this project was implementing functions that PyTorch doesn’t directly support. Some of these functions, like CoLU (Collapsing Linear Unit) and CosLU (Cosine Linear Unit), required careful mathematical formulation to ensure they were both stable and differentiable. Another challenge was designing a flexible and efficient implementation framework that made it easy to experiment with different functions and benchmark their performance.

For each activation function, I followed a structured approach:

* **Mathematical Formulation:** Researching and understanding the theory behind each function.
* **Implementation:** Writing optimised PyTorch code, ensuring compatibility with auto-grad and CUDA acceleration.
* **Visualisation:** Plotting functions and their derivatives to study their behaviour. 

## Notable Activation Functions Implemented

Here are some of the more interesting activation functions I worked on:

* **CReLU (Concatenated ReLU):** Extends ReLU by concatenating positive and negative activations, doubling feature dimensions.
* **CoLU (Collapsing Linear Unit):** Designed to efficiently collapse activations.
* **CosLU (Cosine Linear Unit):** Introduces periodic components, which could help in learning periodic patterns.
* **DELU (Dynamic Exponential Linear Unit):** A variant with adaptive scaling properties.
* **GCU (Growing Cosine Unit):** Uses cosine growth to modify activation responses.
* **LinComb & NormLinComb:** Hybrid activation functions that combine multiple activations.
* **Phish:** A highly flexible and hyper-optimisable activation function.
* **ShiLU (Shifted Linear Unit):** A variation of traditional linear units with adjustable shifts.
* **SineReLU & SinLU:** Integrate sinusoidal components, potentially useful for learning periodic patterns.

## Conclusion

This project reinforced my belief that activation function design is still an open area with a lot of room for exploration. However, while alternative approaches can sometimes offer unique advantages, I strongly suggest go with ReLU or Hyperbolic Tanh whenever you can because it's not the model, it's the problem it solves.

Future work could involve testing these functions on different deep learning tasks, further optimising them, and even integrating learnable parameters for adaptive behaviour.

By making these activation functions available, I hope to contribute to the ongoing search for better neural network architectures and help push deep learning forward in unexpected ways.
