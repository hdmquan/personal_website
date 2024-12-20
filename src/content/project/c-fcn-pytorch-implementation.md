---
title: C-FCN PyTorch Implementation
url: c-fcn-pytorch
description: This is a PyTorch implementation of C-FCN, a low power
  convolutional neural network for cloud segmentation in satellite images, as
  proposed in "Low-power neural networks for semantic segmentation of satellite
  images" (Balh et al., 2019).
author: Alan Huynh
date: 2023-05-11T02:43:00.000Z
image: /assets/images/blog/screenshot_13-12-2024_24236_openaccess.thecvf.com.jpeg
imageAlt: neural network
---
This is a PyTorch implementation of C-FCN, a low power convolutional neural network for cloud segmentation in satellite images, as proposed in "Low-power neural networks for semantic segmentation of satellite images" (Balh et al., [2019](https://openaccess.thecvf.com/content_ICCVW_2019/papers/LPCV/Bahl_Low-Power_Neural_Networks_for_Semantic_Segmentation_of_Satellite_Images_ICCVW_2019_paper.pdf)).

In addition to implementing the original C-FCN architecture, this implementation includes an option to change the final layer to potentially improve accuracy. The available options for the final layer are:

* Bilinear Upscaling (original)
* 2D Transpose Convolution (scale factor: 4)
* 2x 2D Transpose Convolution (scale factor: 2)

This implementation also includes a skipped connection.

GitHub: <https://github.com/hdmquan/C-FCN-PyTorch-implementation>
